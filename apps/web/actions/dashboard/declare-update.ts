"use server";

import { getResumedProvider } from "@/lib/onboarding/resume";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnedEndpoint } from "@/lib/dashboard/versions";
import { declareUpdateSchema, type DeclareUpdateInput } from "@/lib/dashboard/update-validation";

export interface DeclareUpdateResult {
  success: boolean;
  error?: string;
  versionId?: string;
  versionNumber?: number;
}

/**
 * Declare-update wizard's final step (Session 18, Deliverable 4 Step 3).
 * Auth follows the exact pattern every other provider-dashboard mutation in
 * this app already uses — getResumedProvider() (cookie session ->
 * providers.contact_email) + createServiceClient() — not a directory-api
 * route with "provider JWT" auth, which has no precedent or implementation
 * anywhere in this codebase (flagged in the Session 18 report).
 */
export async function declareUpdate(endpointId: string, input: DeclareUpdateInput): Promise<DeclareUpdateResult> {
  const resumed = await getResumedProvider();
  if (!resumed) {
    return { success: false, error: "Your session has expired. Please sign in again." };
  }

  const endpoint = await getOwnedEndpoint(resumed.providerId, endpointId);
  if (!endpoint) {
    return { success: false, error: "Endpoint not found." };
  }

  if (endpoint.pending_recertification) {
    return { success: false, error: "An update is already in progress for this endpoint. Complete it before declaring another." };
  }

  const parsed = declareUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Please check the update details." };
  }
  const data: DeclareUpdateInput = parsed.data;

  const supabase = createServiceClient();

  const { data: providerRow } = await supabase.from("providers").select("contact_email").eq("id", resumed.providerId).maybeSingle();
  const declaredBy = (providerRow as { contact_email: string } | null)?.contact_email ?? "unknown";

  const nextVersionNumber = endpoint.version_number + 1;
  const now = new Date().toISOString();

  const { data: versionRow, error: insertError } = await supabase
    .from("endpoint_versions")
    .insert({
      endpoint_id: endpointId,
      version_number: nextVersionNumber,
      update_category: data.updateCategory,
      provider_change_description: data.changeDescription,
      records_added: data.recordsAdded ?? 0,
      records_modified: data.recordsModified ?? 0,
      records_removed: data.recordsRemoved ?? 0,
      new_parameters: data.newParameters.length > 0 ? data.newParameters : null,
      date_range_extended: data.dateRangeExtended,
      declared_by: declaredBy,
    })
    .select("id")
    .single();

  if (insertError || !versionRow) {
    return { success: false, error: "Could not declare this update. Please try again." };
  }

  const { error: updateError } = await supabase
    .from("endpoints")
    .update({ pending_recertification: true, pending_recertification_since: now })
    .eq("id", endpointId);

  if (updateError) {
    return { success: false, error: "Update was recorded but the endpoint state could not be updated. Contact SBP." };
  }

  return { success: true, versionId: (versionRow as { id: string }).id, versionNumber: nextVersionNumber };
}
