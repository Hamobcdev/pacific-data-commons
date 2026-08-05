"use server";

import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { createOnboardingSession } from "@/lib/onboarding/session";
import type { OnboardingStep } from "@/lib/onboarding/state";

export interface ResumeSessionResult {
  success: boolean;
  providerId?: string;
  sessionToken?: string;
  nextStep?: OnboardingStep;
  /** Onboarding is already fully submitted (Step 7's verification_queue
   * entry exists) — nothing left to resume, send them to the dashboard
   * instead of any wizard step. */
  redirectToDashboard?: boolean;
}

/**
 * Called from two places, both after a real Supabase Auth session cookie
 * already exists: (1) directly from verifyResumeOtp() (lib/onboarding/resume.ts)
 * in the same server-action execution that just wrote the cookie via
 * verifyOtp() (Session 10 — OTP replaced the magic-link flow this comment
 * used to describe), and (2) from the /onboarding index page
 * (OnboardingResumeGate.tsx) for a provider who already has a live session
 * from an earlier visit. Resolves that session's email back to a provider —
 * same identity pattern as getResumedProvider() (lib/onboarding/resume.ts)
 * — then mints a FRESH onboarding session token and works out which step to
 * send them back to from what is actually saved server-side, not from a
 * client localStorage that may not even exist on this device (the whole
 * point of a resume flow is resuming from a different device/browser).
 *
 * Note on session freshness: the Supabase Auth access token (1-hour
 * default expiry) is refreshed on ordinary navigation by middleware.ts,
 * which runs supabase.auth.getUser() on every non-static request. This
 * function's own session read is unaffected either way — the 72-hour
 * onboarding_session_token minted below, not the Auth cookie, is what
 * actually gates onboarding continuation — but dashboard pages that rely on
 * staying authenticated across a longer session now depend on that
 * middleware refresh actually running.
 *
 * Minting a new session token here is a deliberate second exception to
 * "only register.ts creates one" (see createOnboardingSession's own doc
 * comment) — legitimate because identity here is proven by a real,
 * email-ownership-verified Supabase Auth session, not by an unauthenticated
 * form submission, which is exactly the C1 distinction that matters.
 *
 * Step detection walks forward through what each step's own save action
 * actually persists (see the individual actions/onboarding/save-*.ts
 * files) — providers.onboarding_status alone isn't granular enough, it
 * stops changing after Step 3 (upload).
 */
export async function resumeOnboardingSession(): Promise<ResumeSessionResult> {
  const cookieClient = createServerClient();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();
  if (!user?.email) return { success: false };

  const supabase = createServiceClient();
  const { data: provider } = await supabase
    .from("providers")
    .select("id, wallet_verified_at, provenance_declaration")
    .eq("contact_email", user.email)
    .maybeSingle();
  if (!provider) return { success: false };

  const providerId = provider.id as string;

  const { data: queueEntry } = await supabase
    .from("verification_queue")
    .select("id")
    .eq("provider_id", providerId)
    .eq("queue_type", "new_provider")
    .maybeSingle();
  if (queueEntry) return { success: true, providerId, redirectToDashboard: true };

  const sessionToken = await createOnboardingSession(providerId);

  const { data: deployment } = await supabase
    .from("endpoint_deployments")
    .select("id")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (deployment) return { success: true, providerId, sessionToken, nextStep: "complete" };

  if (provider.provenance_declaration) {
    return { success: true, providerId, sessionToken, nextStep: "deploy" };
  }

  const { data: run } = await supabase
    .from("formatting_runs")
    .select("id, provider_approved")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (run?.provider_approved) return { success: true, providerId, sessionToken, nextStep: "provenance" };
  if (run) return { success: true, providerId, sessionToken, nextStep: "review" };

  if (provider.wallet_verified_at) return { success: true, providerId, sessionToken, nextStep: "upload" };

  return { success: true, providerId, sessionToken, nextStep: "wallet" };
}
