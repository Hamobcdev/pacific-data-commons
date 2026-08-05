import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { resumeOnboardingSession, type ResumeSessionResult } from "@/actions/onboarding/resume-session";

export interface ResumeRequestResult {
  success: boolean;
  message: string;
  /** Present only when success is false because of the send-rate-limit —
   * lets the UI show a live countdown instead of a static message
   * (Session 10, Deliverable 3). */
  resetInSeconds?: number;
}

export interface VerifyOtpResult extends ResumeSessionResult {
  /** Distinguishes "wrong/expired code" from "no session at all" so the UI
   * can react differently — a bare `{ success: false }` from
   * resumeOnboardingSession() also means "no provider found for this
   * email," which is a different, unrecoverable-by-retry case. */
  error?: "expired" | "invalid" | "generic";
  message?: string;
}

/**
 * Sends a 6-digit OTP code via Supabase Auth's signInWithOtp (Session 10:
 * replaces the magic-link resume flow — see verifyResumeOtp() below for the
 * corresponding verify step). No `emailRedirectTo` is passed: omitting it is
 * what makes Supabase Auth deliver a code rather than a link.
 *
 * IMPORTANT — this also depends on a Supabase dashboard setting outside this
 * repo's reach: the "Magic Link" email template must render `{{ .Token }}`
 * (the code), not (or in addition to) `{{ .ConfirmationURL }}` (the old
 * link). If the template only renders the link, the provider's email will
 * still show a clickable link with no visible code, and this flow silently
 * regresses to the exact problem it was built to eliminate. Confirm this in
 * the Supabase Auth dashboard before this ships — flagged at end of session.
 *
 * shouldCreateUser: false — this is a resume flow for an existing
 * `providers` row, never a signup path; a code sent to an email with no
 * matching provider should not silently create a dangling Supabase Auth
 * user.
 */
export async function sendResumeOtp(email: string): Promise<ResumeRequestResult> {
  const supabase = createSupabaseJsClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    return { success: false, message: "Could not send a code right now. Please try again shortly." };
  }

  return { success: true, message: "Check your email for a 6-digit code to continue where you left off." };
}

/**
 * Verifies a 6-digit OTP code. Runs entirely server-side (Session 10) using
 * the cookie-aware server Supabase client, not the browser client the
 * original magic-link design called for — that design existed to consume a
 * URL fragment (#access_token=...), which only client-side JS can read
 * (lib/onboarding/resume.ts's prior version, see git history). An OTP code
 * has no such fragment: email + code arrive together as plain server action
 * arguments, so verifyOtp() can run here directly. Doing it server-side
 * keeps lib/onboarding/resume.ts entirely free of `next/headers`-vs-browser
 * bundling concerns (getResumedProvider() below already depends on
 * next/headers via createServerClient(), so this file was never meant to be
 * imported from a "use client" component) and lets the resulting session
 * cookie be written directly via the Server Action's cookie store — the
 * same mechanism validateOnboardingSession()'s callers already rely on.
 *
 * On success, delegates identity resolution to resumeOnboardingSession()
 * (actions/onboarding/resume-session.ts) — same as the old flow — so there
 * is exactly one place that decides "which step does this provider resume
 * at," not two.
 */
export async function verifyResumeOtp(email: string, token: string): Promise<VerifyOtpResult> {
  const supabase = createServerClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("expired")) {
      return { success: false, error: "expired", message: "Code expired. Request a new one." };
    }
    if (msg.includes("invalid") || msg.includes("token")) {
      return { success: false, error: "invalid", message: "Incorrect code. Check your email and try again." };
    }
    return { success: false, error: "generic", message: "Verification failed. Please try again." };
  }

  const result = await resumeOnboardingSession();
  if (!result.success) {
    return { success: false, error: "generic", message: "We verified your code but couldn't find your registration. Please contact SBP." };
  }
  return result;
}

/**
 * Resolves the currently-authenticated Supabase session back to a provider
 * record, by contact_email. Returns null if there is no session or no
 * matching provider — callers should fall back to localStorage / starting
 * fresh, never treat this as an error. Used by the dashboard entry point
 * (app/[locale]/dashboard/page.tsx), which is a separate consumer from the
 * onboarding resume flow above and out of scope for Session 10.
 */
export async function getResumedProvider(): Promise<{ providerId: string; onboardingStatus: string } | null> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const { data: provider } = await supabase
    .from("providers")
    .select("id, onboarding_status")
    .eq("contact_email", user.email)
    .maybeSingle();

  if (!provider) return null;
  return { providerId: provider.id as string, onboardingStatus: provider.onboarding_status as string };
}
