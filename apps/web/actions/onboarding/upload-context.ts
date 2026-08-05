"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { uploadContextSchema, type UploadContextData } from "@/lib/onboarding/validation";
import { validateOnboardingSession, InvalidOnboardingSessionError, SESSION_EXPIRED_ERROR } from "@/lib/onboarding/session";

export interface UploadContextResult {
  success: boolean;
  error?: string;
  field?: string;
}

/**
 * Saves Step 3's data-context form. There is no `endpoints` row yet at this
 * point in onboarding (that's created later, once the AI formatting
 * pipeline / provider review in Session 6 produces an endpoint
 * configuration) — this is provider-self-reported context ahead of that
 * pipeline running, which is exactly what formatting_runs.stage_classification
 * is described as holding ("Stage 2: data_category, sub_category,
 * geography, time_period, quality_flags"). A later pipeline stage can
 * confirm or refine these values; this action just gets them durably into
 * Supabase (R4) rather than only localStorage.
 */
export async function saveUploadContext(
  providerId: string,
  sessionToken: string,
  uploadedFileIds: string[],
  data: UploadContextData,
): Promise<UploadContextResult> {
  try {
    await validateOnboardingSession(providerId, sessionToken);
  } catch (err) {
    return { success: false, error: err instanceof InvalidOnboardingSessionError ? SESSION_EXPIRED_ERROR : "Invalid session." };
  }

  const parsed = uploadContextSchema.safeParse({
    ...data,
    uploadedFiles: uploadedFileIds.map((id) => ({ id, uploadStatus: "complete" as const })),
  });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "Invalid input.", field: firstIssue?.path[0] as string | undefined };
  }

  const supabase = createServiceClient();

  const { error: formattingRunError } = await supabase.from("formatting_runs").insert({
    provider_id: providerId,
    file_ids: uploadedFileIds,
    stage_classification: {
      data_title: parsed.data.dataTitle,
      data_description: parsed.data.dataDescription,
      data_category: parsed.data.dataCategory,
      geography_region: parsed.data.geographyRegion,
      time_period_start: Number(parsed.data.timePeriodStart),
      time_period_end: Number(parsed.data.timePeriodEnd),
      methodology_summary: parsed.data.methodologySummary,
      indigenous_data_flag: parsed.data.indigenousDataFlag,
      cultural_sensitivity: parsed.data.culturalSensitivity,
    },
    status: "queued",
  });

  if (formattingRunError) {
    console.error("Upload context save failed:", formattingRunError);
    return {
      success: false,
      error: "We couldn't save your data description. Check your connection and try again — your uploaded files are safe. If this keeps happening, email support@synergybcpacific.com.",
    };
  }

  const { error: providerUpdateError } = await supabase
    .from("providers")
    .update({ onboarding_status: "verification_pending" })
    .eq("id", providerId);

  if (providerUpdateError) {
    // Non-fatal for the provider's flow — the context is already saved.
    console.error("Provider status update failed after upload context save:", providerUpdateError);
  }

  return { success: true };
}
