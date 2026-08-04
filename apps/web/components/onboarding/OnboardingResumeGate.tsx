"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { resumeOnboardingSession } from "@/actions/onboarding/resume-session";
import { loadLocalState, saveLocalState, defaultState } from "@/lib/onboarding/state";
import type { OnboardingStep } from "@/lib/onboarding/state";

const STEP_ROUTES: Record<OnboardingStep, string> = {
  register: "/onboarding/register",
  wallet: "/onboarding/wallet",
  upload: "/onboarding/upload",
  review: "/onboarding/review",
  provenance: "/onboarding/provenance",
  deploy: "/onboarding/deploy",
  complete: "/onboarding/complete",
};

/**
 * The smart entry point at /onboarding — visited directly (no session to
 * resume, falls through to Step 1) and as the magic link's redirect target
 * (see lib/onboarding/resume.ts), where there usually IS a session to
 * resume, often on a device whose localStorage has never seen this
 * provider before.
 *
 * Only restores providerId/sessionToken/currentStep into localStorage —
 * not the full per-step form field state, which each step's own
 * server-backed data (e.g. ReviewLayout's getReviewContext) or a graceful
 * blank-field fallback (e.g. WalletForm's institutionName) already covers.
 * Reconstructing every typed field from the DB is a much bigger job than
 * this bug fix — providerId + sessionToken + the correct step is what was
 * actually broken (magic link always redirected to Step 1 with no session
 * established at all).
 */
export function OnboardingResumeGate() {
  const t = useTranslations("Onboarding.shell");
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "redirecting">("checking");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // The magic link's implicit-flow session lives in a URL fragment
      // (#access_token=...) — never sent to a server, only readable
      // client-side. createClient() here is the cookie-aware browser
      // Supabase client (lib/supabase/client.ts); simply calling
      // getSession() makes it parse that fragment (detectSessionInUrl,
      // enabled by default) and persist the resulting session to a cookie
      // — which is what makes it visible to the server-side session check
      // resumeOnboardingSession() does next. A plain direct visit to
      // /onboarding (no fragment) is a harmless no-op here.
      const supabase = createClient();
      await supabase.auth.getSession();
      if (cancelled) return;

      const result = await resumeOnboardingSession();
      if (cancelled) return;
      setStatus("redirecting");

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

      // No authenticated session (the normal case for a fresh visit to
      // /onboarding, not via a magic link) or no matching provider —
      // nothing to resume, start at Step 1.
      router.replace("/onboarding/register");
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return <p className="mt-6 text-sm text-gray-500">{t("resuming")}</p>;
}
