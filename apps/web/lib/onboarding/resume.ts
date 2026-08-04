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
 *
 * flowType: "implicit" explicitly — PKCE isn't viable here: it requires
 * the client that INITIATES the auth request to persist a code_verifier
 * somewhere durable, then present it again to COMPLETE the exchange. That
 * client is this server action, running server-side with no request-scoped
 * browser storage; the verifier would only ever live in one ephemeral
 * Supabase client instance's memory, gone by the time the link is actually
 * clicked (a different request, likely minutes later, possibly a
 * different server process). Implicit flow has no such lifecycle problem —
 * the token is self-contained in the link itself, exactly the property a
 * "resume from any device, any time" flow needs.
 *
 * `redirectPath` is a page, not a route handler: implicit flow appends
 * `#access_token=...&refresh_token=...` as a URL FRAGMENT, which browsers
 * never send to a server at all — only client-side JS can read it. That
 * page (OnboardingResumeGate.tsx, mounted at /onboarding) uses the
 * cookie-aware browser Supabase client to pick up the fragment and
 * establish a real session cookie, then resolves it back to a provider
 * (matching providers.contact_email to the session's email — see
 * getResumedProvider / resumeOnboardingSession) and sends them to their
 * actual next step. Previously this pointed straight at
 * /onboarding/register, which did nothing with the fragment at all, so the
 * link never actually authenticated anything and every resume attempt
 * silently landed on a blank Step 1.
 *
 * Requires Supabase Auth email delivery (Resend as the SMTP provider) to be
 * configured in the live project — this cannot be verified end-to-end
 * without one (see Session 5 report).
 */
export async function sendResumeLink(email: string, redirectPath = "/onboarding"): Promise<ResumeRequestResult> {
  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return { success: false, message: "Resume links are not configured yet. Please contact SBP." };
  }

  const supabase = createSupabaseJsClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit" },
  });

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
