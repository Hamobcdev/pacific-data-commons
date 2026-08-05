import { SESSION_EXPIRED_FLASH_KEY } from "./session-constants";

/** Writes the one-shot flash message ResumeOtp.tsx reads and clears on
 * mount, then the caller (a step form) redirects to /onboarding. Imports
 * from session-constants.ts, not session.ts — that module also exports
 * server-only helpers (validateOnboardingSession uses createServiceClient,
 * which transitively imports next/headers) and this one is called from
 * "use client" step-form components. */
export function flagSessionExpired(message: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_EXPIRED_FLASH_KEY, message);
}
