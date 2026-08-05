"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { resumeOnboardingSession } from "@/actions/onboarding/resume-session";
import { loadLocalState, saveLocalState, defaultState } from "@/lib/onboarding/state";
import { STEP_ROUTES } from "@/lib/onboarding/step-routes";

/**
 * The entry point at /onboarding — visited directly (no session to resume,
 * falls through to Step 1) and by a provider who already has a live
 * Supabase Auth session cookie from an earlier OTP verification in the same
 * browser (Session 10: the OTP flow itself now routes a provider straight
 * to their step from ResumeOtp.tsx on successful verify, without ever
 * passing through here — see that component).
 *
 * Session 9/10.2's magic-link version of this component consumed a URL
 * fragment (#access_token=...) client-side, which is why it needed the
 * browser Supabase client and a client-side getSession() call before
 * checking the server-side session. OTP verification establishes the
 * session cookie directly in the verify-otp server action (see
 * lib/onboarding/resume.ts's verifyResumeOtp) — there is no fragment for a
 * plain visit to /onboarding to consume, so this component now only needs
 * to ask "does a session already exist" and route accordingly.
 *
 * Only restores providerId/sessionToken/currentStep into localStorage —
 * not the full per-step form field state, which each step's own
 * server-backed data or a graceful blank-field fallback already covers.
 */
export function OnboardingResumeGate() {
  const t = useTranslations("Onboarding.shell");
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await resumeOnboardingSession();
      if (cancelled) return;

      if (result.success && result.redirectToDashboard) {
        router.replace("/dashboard");
        return;
      }

      if (result.success && result.providerId && result.sessionToken && result.nextStep) {
        const state = loadLocalState() ?? defaultState();
        saveLocalState({ ...state, providerId: result.providerId, sessionToken: result.sessionToken, currentStep: result.nextStep });
        router.replace(STEP_ROUTES[result.nextStep]);
        return;
      }

      // No authenticated session or no matching provider — nothing to
      // resume, start at Step 1.
      router.replace("/onboarding/register");
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return <p className="mt-6 text-sm text-gray-500">{t("resuming")}</p>;
}
