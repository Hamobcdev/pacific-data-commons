"use server";

import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { createOnboardingSession } from "@/lib/onboarding/session";

export type StartNewDatasetResult =
  | { success: true; providerId: string; sessionToken: string }
  | { success: false; error: string };

/**
 * Bridges an already-onboarded provider's Supabase Auth session (Mechanism
 * A — the cookie getResumedProvider() reads) to a fresh onboarding session
 * token (Mechanism B — the 72-hour token every onboarding/upload server
 * action requires, see lib/onboarding/session.ts) so a returning provider
 * can add a second dataset without re-running Steps 1–2.
 *
 * Mirrors resumeOnboardingSession()'s identity pattern (same
 * auth.getUser() -> contact_email -> providers row lookup) but diverges
 * from it deliberately at the "already fully onboarded" branch:
 * resumeOnboardingSession() sends that provider to the dashboard, because
 * it's built for someone continuing an *unfinished* registration. This
 * action is the opposite case — the provider is deliberately starting a
 * *new* dataset cycle on top of a completed one — so a queue entry is the
 * required precondition, not an early exit.
 *
 * Security note: this is the second deliberate exception (after
 * resumeOnboardingSession) to "only register.ts mints a session token for
 * an unauthenticated request" (see createOnboardingSession's own doc
 * comment, and the C1 fix in register.ts) — justified the same way: the
 * caller's identity is already proven by a live Supabase Auth session, not
 * by an unauthenticated form submission.
 */
export async function startNewDataset(): Promise<StartNewDatasetResult> {
  const cookieClient = createServerClient();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();

  if (!user?.email) {
    return { success: false, error: "Not authenticated. Please sign in." };
  }

  const supabase = createServiceClient();
  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("contact_email", user.email)
    .maybeSingle();

  if (!provider) {
    return { success: false, error: "No provider account found for this email." };
  }

  const providerId = provider.id as string;

  const { data: queueEntry } = await supabase
    .from("verification_queue")
    .select("id")
    .eq("provider_id", providerId)
    .eq("queue_type", "new_provider")
    .maybeSingle();

  if (!queueEntry) {
    return { success: false, error: "Please complete your initial registration first." };
  }

  const sessionToken = await createOnboardingSession(providerId);

  return { success: true, providerId, sessionToken };
}
