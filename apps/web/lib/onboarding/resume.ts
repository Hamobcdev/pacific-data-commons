import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

export interface ResumeRequestResult {
  success: boolean;
  message: string;
}

/**
 * Sends a magic-link resume email via Supabase Auth's built-in OTP flow
 * (R4: resumable from any device). Deliberately does not invent a custom
 * token/table — `providers` has no resume-token column, and Supabase Auth
 * already provides secure, expiring, single-use links out of the box.
 * Clicking the emailed link lands the provider back on `redirectPath` with
 * an authenticated Supabase session (cookie-based, via lib/supabase/client.ts
 * + middleware); the provider record is then resolved by matching
 * providers.contact_email to the authenticated session's email (see
 * getResumedProvider below) — no separate identity system to keep in sync.
 *
 * Requires Supabase Auth email delivery (Resend as the SMTP provider) to be
 * configured in the live project — this cannot be verified end-to-end
 * without one (see Session 5 report).
 */
export async function sendResumeLink(email: string, redirectPath = "/onboarding/register"): Promise<ResumeRequestResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return { success: false, message: "Resume links are not configured yet. Please contact SBP." };
  }

  const supabase = createSupabaseJsClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${appUrl}${redirectPath}` },
  });

  if (error) {
    return { success: false, message: "Could not send a resume link right now. Please try again shortly." };
  }

  return { success: true, message: "Check your email for a link to continue where you left off." };
}

/**
 * Resolves the currently-authenticated (via magic link) Supabase session
 * back to a provider record, by contact_email. Returns null if there is no
 * session or no matching provider — callers should fall back to
 * localStorage / starting fresh, never treat this as an error.
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
