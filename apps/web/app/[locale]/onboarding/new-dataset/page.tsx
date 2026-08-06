"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { startNewDataset } from "@/actions/onboarding/start-new-dataset";
import { loadLocalState, saveLocalState, defaultState } from "@/lib/onboarding/state";
import { STEP_ROUTES } from "@/lib/onboarding/step-routes";
import { flagSessionExpired } from "@/lib/onboarding/flag-session-expired";

/**
 * Entry point for "Add Dataset" in GlobalNav (Session 12) — bridges an
 * already-onboarded provider straight to the upload step for a second (or
 * later) dataset, without re-running Steps 1–2. Mirrors
 * OnboardingResumeGate.tsx's merge pattern: only providerId/sessionToken/
 * currentStep are overwritten on top of existing local state (or a fresh
 * defaultState()), never the per-step form fields — the upload form itself
 * (components/upload/UploadForm.tsx) only requires providerId + sessionToken
 * to be present.
 */
export default function NewDatasetPage() {
  const t = useTranslations("NewDataset");
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await startNewDataset();
      if (cancelled) return;

      if (result.success) {
        const state = loadLocalState() ?? defaultState();
        saveLocalState({
          ...state,
          providerId: result.providerId,
          sessionToken: result.sessionToken,
          currentStep: "upload",
        });
        router.replace(STEP_ROUTES.upload);
        return;
      }

      flagSessionExpired(`${result.error} ${t("flashMessage")}`);
      router.replace("/onboarding/register");
    })();

    return () => {
      cancelled = true;
    };
  }, [router, t]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div
          className="w-8 h-8 border-2 border-pacific-green border-t-transparent rounded-full animate-spin mx-auto mb-4"
          aria-hidden="true"
        />
        <p className="text-gray-500 text-sm">{t("loading")}</p>
      </div>
    </div>
  );
}
