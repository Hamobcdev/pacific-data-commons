import { createServerClient } from "@/lib/supabase/server";

/**
 * Session 39 — first implementation of the ADMIN_EMAIL bypass CLAUDE.md
 * §26.5 has documented as a standing requirement since the 2026-08-13
 * hotfix session but never had code for. Scope here is deliberately
 * narrow: this only answers "does the current Supabase Auth session's
 * email match ADMIN_EMAIL" for gating /admin/financial-rails. It does not
 * implement §26.5's own bypass (the verification_queue.status check in
 * resumeOnboardingSession()/startNewDataset()) — that's still open, tracked
 * separately in docs/bugs/2026-08-13-returning-provider-routing.md's BUG 2.
 *
 * ADMIN_EMAIL is read directly from process.env, never hardcoded or
 * committed (CLAUDE.md P4) — same posture as every other secret in this
 * app. An unset ADMIN_EMAIL means no session is ever an admin session,
 * fail-closed rather than fail-open.
 */
export async function isAdminSession(): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return false;

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.email === adminEmail;
}
