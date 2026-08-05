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
  /** Distinguishes "wrong/expired code" ("invalid") from "no session at
   * all" ("generic" — a bare `{ success: false }` from
   * resumeOnboardingSession() means "no provider found for this email," a
   * different, unrecoverable-by-retry case).
   *
   * Hotfix (2026-08-05): there used to be a third value, "expired", used
   * when Supabase's error looked time-related. Removed — see
   * verifyResumeOtp()'s comment below for why that distinction turned out
   * to be one this function cannot actually make. */
  error?: "invalid" | "generic";
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

  // Hotfix (2026-08-05): was "6-digit code" — live testing showed Supabase
  // emailing 7- and 8-digit codes for this project. See otp-code.ts.
  return { success: true, message: "Check your email for a code to continue where you left off." };
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
    // Diagnosis (hotfix, 2026-08-05): pulled this project's live Supabase
    // auth logs (mcp Supabase get_logs, service "auth") for real /verify
    // failures. Every one came back identically:
    //   error: "token has expired or is invalid", error_code: "otp_expired"
    // GoTrue does not appear to distinguish "this code is genuinely past
    // its expiry window" from "this code is simply wrong or incomplete" in
    // this response — both produce the exact same message and error_code.
    // The previous version of this function checked `msg.includes("expired")`
    // FIRST, so it confidently — and wrongly — labelled every wrong-code
    // submission "Code expired," which is the reported bug (an "expired"
    // message appearing within seconds of the email arriving, nowhere near
    // any real timeout). This was very likely compounded by Bug 1: the old
    // 6-box UI auto-submitted the instant 6 digits were entered, so a real
    // 7- or 8-digit code got truncated and submitted incomplete — Supabase
    // correctly rejected that truncated code, and this function then
    // mislabelled the rejection as expiry. Fix: since Supabase's response
    // genuinely does not let us tell these apart, stop asserting a specific
    // cause and say so honestly instead.
    return {
      success: false,
      error: "invalid",
      message: "Incorrect or expired code. Check your email for the latest code and try again, or request a new one.",
    };
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
