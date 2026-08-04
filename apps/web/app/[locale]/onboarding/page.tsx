import { OnboardingResumeGate } from "@/components/onboarding/OnboardingResumeGate";

/**
 * Smart entry point — see OnboardingResumeGate.tsx. Previously this
 * unconditionally redirected to /onboarding/register, which is also why a
 * magic-link resume always landed on a blank Step 1 even on the rare
 * occasion an auth session had been established: nothing here ever looked
 * at it.
 */
export default function OnboardingIndexPage() {
  return <OnboardingResumeGate />;
}
