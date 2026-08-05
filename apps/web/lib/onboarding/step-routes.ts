import type { OnboardingStep } from "./state";

/** Shared by OnboardingResumeGate (direct /onboarding visits) and
 * ResumeOtp (post-verification routing) — both need to turn a resolved
 * OnboardingStep into a route, and duplicating this map risked the two
 * drifting apart. */
export const STEP_ROUTES: Record<OnboardingStep, string> = {
  register: "/onboarding/register",
  wallet: "/onboarding/wallet",
  upload: "/onboarding/upload",
  review: "/onboarding/review",
  provenance: "/onboarding/provenance",
  deploy: "/onboarding/deploy",
  complete: "/onboarding/complete",
};
