/** Zero-dependency constants shared between server-only session logic
 * (lib/onboarding/session.ts, which imports createServiceClient and is
 * therefore never safe to import from a "use client" component) and
 * client-side consumers (ResumeOtp.tsx, flag-session-expired.ts). Splitting
 * these two string constants out here is what lets both sides import the
 * same values without a client bundle ever pulling in next/headers
 * transitively through lib/supabase/server.ts. */

/** Sentinel value every onboarding step's server actions return (instead of
 * a human-readable message) when validateOnboardingSession() rejects the
 * providerId/sessionToken pair — Session 10, Deliverable 2. */
export const SESSION_EXPIRED_ERROR = "SESSION_EXPIRED" as const;

/** localStorage key a step form writes to before redirecting on
 * SESSION_EXPIRED_ERROR — read once and cleared by ResumeOtp.tsx. */
export const SESSION_EXPIRED_FLASH_KEY = "pdc_session_expired_message";
