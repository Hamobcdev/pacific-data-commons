"use server";

import { z } from "zod";
import { verifyResumeOtp, type VerifyOtpResult } from "@/lib/onboarding/resume";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { OTP_CODE_MIN_LENGTH, OTP_CODE_MAX_LENGTH } from "@/lib/onboarding/otp-code";

// Hotfix (2026-08-05): was `z.string().length(6)` — live testing showed
// Supabase emailing 7- and 8-digit codes, which this rejected before the
// request ever reached verifyResumeOtp()/Supabase. See otp-code.ts's
// OTP_CODE_MIN_LENGTH/MAX_LENGTH doc comment for the full finding.
const schema = z.object({
  email: z.string().email(),
  token: z
    .string()
    .min(OTP_CODE_MIN_LENGTH, `Enter at least ${OTP_CODE_MIN_LENGTH} digits`)
    .max(OTP_CODE_MAX_LENGTH, `Code is too long`)
    .regex(/^\d{6,8}$/, "Code must be 6-8 digits"),
});

/**
 * Verifies a 6–8 digit OTP code (Session 10; digit-length hotfix
 * 2026-08-05 — see schema comment above). Rate limited tighter than the
 * send-code action (5 attempts / email / 15 min, vs. 3 sends / hour) —
 * brute-forcing even a 6-digit code (10^6 space) with only 5 guesses is
 * negligible risk, but the limit exists so a script can't sit there
 * grinding through codes for the window a real one is valid. Cleared
 * implicitly by the window expiring; there is no explicit clear-on-success
 * call because a successful verify establishes a session and the provider
 * has no further reason to submit codes for that email in the same window.
 */
export async function verifyOtp(email: string, token: string): Promise<VerifyOtpResult> {
  const parsed = schema.safeParse({ email, token });
  if (!parsed.success) {
    return { success: false, error: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid code format." };
  }

  const ip = await getClientIp();
  const emailLimit = checkRateLimit({
    identifier: `otp-verify:${parsed.data.email.toLowerCase()}`,
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  });
  const ipLimit = checkRateLimit({ identifier: `otp-verify-ip:${ip}`, maxRequests: 5, windowMs: 15 * 60 * 1000 });
  if (!emailLimit.allowed || !ipLimit.allowed) {
    return { success: false, error: "generic", message: "Too many attempts. Please request a new code." };
  }

  return verifyResumeOtp(parsed.data.email, parsed.data.token);
}
