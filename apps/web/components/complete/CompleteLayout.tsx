"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { completeOnboarding } from "@/actions/onboarding/complete-onboarding";
import { loadLocalState, clearLocalState } from "@/lib/onboarding/state";
import { Button } from "@/components/ui/button";
import { CompletionCard } from "./CompletionCard";
import { NextStepsTimeline } from "./NextStepsTimeline";
import { UsdcRealitySection } from "./UsdcRealitySection";

/** Not itself in the Session 6 file list — same glue role as
 * ReviewLayout/ProvenanceForm/DeployLayout for the earlier steps: page.tsx
 * is a Server Component, this holds the client-side "read state, call the
 * completion action, then clear local state" sequence. */
export function CompleteLayout() {
  const t = useTranslations("Onboarding.Complete");
  const router = useRouter();
  // Same fix as WalletForm (Session 9 follow-up) — see that component's
  // comment. This file never rendered blank (both branches already showed
  // t("loading")), but the missing-session redirect case was indistinguishable
  // from the normal "waiting on completeOnboarding()" case; this gives it
  // its own message, same as every other step.
  const [status, setStatus] = useState<"checking" | "redirecting" | "ready">("checking");
  const [summary, setSummary] = useState<{ institutionName: string; datasetTitle: string; providerSlug: string } | null>(null);

  useEffect(() => {
    const state = loadLocalState();
    if (!state?.providerId || !state.sessionToken) {
      setStatus("redirecting");
      router.replace("/onboarding/register");
      return;
    }

    completeOnboarding(state.providerId, state.sessionToken).then((result) => {
      if (result.success) {
        setSummary({ institutionName: result.institutionName, datasetTitle: result.datasetTitle, providerSlug: result.providerSlug });
        setStatus("ready");
      }
      // result.success === false intentionally leaves status as "checking"
      // here — unchanged from this file's prior behaviour (no other
      // changes): the loading message stays up rather than a dead end.

      // R3/R4: local state's job ends here — the submission is durably in
      // Supabase (providers/endpoints/formatting_runs/verification_queue),
      // so there is nothing left for localStorage to protect against a lost
      // connection. Clears the actual unified state key this app uses
      // (lib/onboarding/state.ts), plus the per-step key names named in the
      // Session 6 brief defensively, in case anything ever wrote to them.
      clearLocalState();
      for (const legacyKey of ["pdc_review_state", "pdc_onboarding_step", "pdc_upload_state"]) {
        window.localStorage.removeItem(legacyKey);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (status === "redirecting") {
    return <p className="mt-8 text-sm text-gray-500">{t("redirecting")}</p>;
  }

  if (status === "checking" || !summary) {
    return <p className="mt-8 text-sm text-gray-500">{t("loading")}</p>;
  }

  return (
    <div className="mt-6 space-y-6">
      <CompletionCard institutionName={summary.institutionName} datasetTitle={summary.datasetTitle} providerSlug={summary.providerSlug} />
      <NextStepsTimeline />
      <UsdcRealitySection />
      <Button type="button" onClick={() => router.push("/dashboard")}>
        {t("dashboardLink")}
      </Button>
    </div>
  );
}
