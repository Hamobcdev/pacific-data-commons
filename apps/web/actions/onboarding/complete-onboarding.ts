"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/onboarding/slug";
import { validateOnboardingSession, InvalidOnboardingSessionError, SESSION_EXPIRED_ERROR } from "@/lib/onboarding/session";

export interface CompleteOnboardingResult {
  success: boolean;
  error?: string;
  institutionName: string;
  datasetTitle: string;
  providerSlug: string;
}

/**
 * Step 7 render-time action. There is no "onboarding_complete" value in
 * providers.onboarding_status (session1_migration.sql already moves it to
 * 'verification_pending' at Step 3 — the whole review/provenance/deploy
 * submission is still "pending SBP verification" until reviewed, CLAUDE.md
 * Section 8 Bronze tier). What Step 7 actually needs to do is put the
 * provider into SBP's real review queue (`verification_queue`, DOMAIN 2) —
 * that's the queue verification-review.ts and the (future) SBP admin panel
 * would read from. Idempotent: skips the insert if a 'new_provider' queue
 * entry already exists for this provider (re-visiting Step 7 must not
 * duplicate the queue).
 */
export async function completeOnboarding(providerId: string, sessionToken: string): Promise<CompleteOnboardingResult> {
  try {
    await validateOnboardingSession(providerId, sessionToken);
  } catch (err) {
    return {
      success: false,
      error: err instanceof InvalidOnboardingSessionError ? SESSION_EXPIRED_ERROR : "Invalid session.",
      institutionName: "",
      datasetTitle: "",
      providerSlug: "",
    };
  }

  const supabase = createServiceClient();

  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .select("institution_name")
    .eq("id", providerId)
    .maybeSingle();

  if (providerError || !provider) {
    console.error("Complete onboarding — provider lookup failed:", providerError);
    return { success: false, error: "Could not find your provider record.", institutionName: "", datasetTitle: "", providerSlug: "" };
  }

  const { data: endpoint } = await supabase
    .from("endpoints")
    .select("title")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: existingQueueEntry } = await supabase
    .from("verification_queue")
    .select("id")
    .eq("provider_id", providerId)
    .eq("queue_type", "new_provider")
    .maybeSingle();

  if (!existingQueueEntry) {
    const { error: queueError } = await supabase.from("verification_queue").insert({
      provider_id: providerId,
      queue_type: "new_provider",
      target_tier: "bronze",
      status: "queued",
    });
    if (queueError) {
      console.error("Complete onboarding — verification_queue insert failed:", queueError);
      // Non-fatal — the provider's submission is already fully saved from
      // Steps 1-6; this just means SBP's queue entry needs to be created
      // manually. Never block the completion screen on this.
    }
  }

  return {
    success: true,
    institutionName: provider.institution_name as string,
    datasetTitle: (endpoint?.title as string | undefined) ?? "",
    providerSlug: slugify(provider.institution_name as string),
  };
}
