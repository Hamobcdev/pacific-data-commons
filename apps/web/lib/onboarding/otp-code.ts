export const OTP_CODE_MIN_LENGTH = 6;
export const OTP_CODE_MAX_LENGTH = 8;

/**
 * Hotfix (2026-08-05): live testing showed Supabase emailing 7- and
 * 8-digit codes ("6041117", "50798993"), not the 6 digits the app assumed.
 * The previous fixed-length 6-box UI and the server action's
 * `z.string().length(6)` both hard-assumed 6 — every real code was
 * silently truncated (the box UI auto-submitted the moment the 6th box
 * filled) or rejected outright before ever reaching Supabase. Widened to a
 * tolerant 6–8 digit range everywhere a code length is validated
 * (verify-otp.ts, ResumeOtp.tsx) rather than hardcoding 6.
 */
export function isValidOtpLength(value: string): boolean {
  return value.length >= OTP_CODE_MIN_LENGTH && value.length <= OTP_CODE_MAX_LENGTH;
}

/** Strips everything but digits and caps at OTP_CODE_MAX_LENGTH — used for
 * both manual typing and paste into the single free-form code input
 * (Hotfix: replaced the fixed 6-box UI, which could only ever represent
 * exactly 6 characters). */
export function sanitizeOtpInput(raw: string, maxLength = OTP_CODE_MAX_LENGTH): string {
  return raw.replace(/\D/g, "").slice(0, maxLength);
}

/**
 * Hotfix (2026-08-05): this was previously hardcoded to 600 (10 minutes)
 * directly in ResumeOtp.tsx, not here despite the name suggesting this file
 * was where it lived. Supabase's default email OTP expiry is 3600 seconds
 * (1 hour) — confirmed via this project's Supabase dashboard is still
 * required (GoTrue's site config, including the OTP expiry policy, is not
 * exposed as a queryable Postgres table or through the available tooling;
 * only inferred here from Supabase's documented default). A too-short
 * client-side assumption means the UI can show "Code expired" up to ~50
 * minutes before Supabase would actually reject a still-valid code — a
 * distinct bug from the mis-classified-error-message issue this hotfix
 * also fixes in lib/onboarding/resume.ts's verifyResumeOtp().
 */
export const OTP_CODE_TTL_SECONDS = 60 * 60;

/**
 * Pure decision function pulled out of ResumeOtp.tsx's expiry effect so it
 * has direct unit coverage (hotfix, Deliverable 3) rather than only being
 * verifiable by reading the component: `codeExpiresAt` is `null` both on
 * mount and any time no code has been sent yet, so `isCodeExpired` is
 * false in exactly those cases by construction — there is no separate
 * "just mounted" special case to get wrong.
 */
export function isCodeExpired(codeExpiresAt: number | null, now: number): boolean {
  return codeExpiresAt !== null && now >= codeExpiresAt;
}
