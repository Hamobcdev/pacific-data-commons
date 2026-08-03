import { createServiceClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

export const ONBOARDING_SESSION_DURATION_HOURS = 72;

export class InvalidOnboardingSessionError extends Error {}

/**
 * Generate a new onboarding session token for a provider. Called once at
 * Step 1 completion (register.ts) — never re-issued for an existing
 * provider record from an unauthenticated request, since that is exactly
 * the C1 hijack path this module closes (see register.ts for the
 * resume-by-email guard).
 */
export async function createOnboardingSession(providerId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + ONBOARDING_SESSION_DURATION_HOURS);

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("providers")
    .update({
      onboarding_session_token: token,
      onboarding_session_expires_at: expiresAt.toISOString(),
    })
    .eq("id", providerId);

  if (error) throw new Error("Failed to create onboarding session");
  return token;
}

/**
 * Validate an onboarding session token. Called as the first line of every
 * onboarding/upload server action before any database read or write.
 * Throws InvalidOnboardingSessionError (never a generic Error) if
 * providerId + sessionToken don't match a live session — callers catch this
 * and return their normal result shape so the client never sees a stack
 * trace (CLAUDE.md P9-adjacent UX rule already used by lib/agents/runner.ts).
 */
export async function validateOnboardingSession(
  providerId: string,
  sessionToken: string,
): Promise<{ id: string; contact_email: string; institution_id: string | null }> {
  if (!providerId || !sessionToken) {
    throw new InvalidOnboardingSessionError("Invalid session — missing credentials");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("providers")
    .select("id, contact_email, institution_id, onboarding_session_token, onboarding_session_expires_at")
    .eq("id", providerId)
    .eq("onboarding_session_token", sessionToken)
    .maybeSingle();

  if (error || !data) {
    throw new InvalidOnboardingSessionError("Invalid session — provider not found");
  }

  const expiry = new Date((data.onboarding_session_expires_at as string | null) ?? 0);
  if (expiry < new Date()) {
    throw new InvalidOnboardingSessionError("Session expired — please restart onboarding");
  }

  return {
    id: data.id as string,
    contact_email: data.contact_email as string,
    institution_id: data.institution_id as string | null,
  };
}
