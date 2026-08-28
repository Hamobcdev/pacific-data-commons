"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { completeOnboarding } from "@/actions/onboarding/complete-onboarding";
import { loadLocalState, clearLocalState, type DeployPath } from "@/lib/onboarding/state";
import { SESSION_EXPIRED_ERROR } from "@/lib/onboarding/session-constants";
import { flagSessionExpired } from "@/lib/onboarding/flag-session-expired";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompletionCard } from "./CompletionCard";
import { NextStepsTimeline } from "./NextStepsTimeline";
import { UsdcRealitySection } from "./UsdcRealitySection";
import { WhatHappensNext } from "./WhatHappensNext";

/** Not itself in the Session 6 file list — same glue role as
 * ReviewLayout/ProvenanceForm/DeployLayout for the earlier steps: page.tsx
 * is a Server Component, this holds the client-side "read state, call the
 * completion action, then clear local state" sequence. */
export function CompleteLayout() {
  const t = useTranslations("Onboarding.Complete");
  const tShell = useTranslations("Onboarding.shell");
  const router = useRouter();
  // Same fix as WalletForm (Session 9 follow-up) — see that component's
  // comment. This file never rendered blank (both branches already showed
  // t("loading")), but the missing-session redirect case was indistinguishable
  // from the normal "waiting on completeOnboarding()" case; this gives it
  // its own message, same as every other step.
  const [status, setStatus] = useState<"checking" | "redirecting" | "ready">("checking");
  const [summary, setSummary] = useState<{ institutionName: string; datasetTitle: string; providerSlug: string } | null>(null);
  // Session 37A — read once alongside providerId/sessionToken below, before
  // clearLocalState() removes it, so the "what happens next" section can
  // show the copy for the path the provider actually chose in Step 6.
  const [deployPath, setDeployPath] = useState<DeployPath | "">("");

  useEffect(() => {
    const state = loadLocalState();
    if (!state?.providerId || !state.sessionToken) {
      setStatus("redirecting");
      router.replace("/onboarding/register");
      return;
    }
    setDeployPath(state.deploy.path);

    completeOnboarding(state.providerId, state.sessionToken).then((result) => {
      if (result.success) {
        setSummary({ institutionName: result.institutionName, datasetTitle: result.datasetTitle, providerSlug: result.providerSlug });
        setStatus("ready");
      } else if (result.error === SESSION_EXPIRED_ERROR) {
        // Session 10, Deliverable 2: previously left status as "checking"
        // forever — a silent dead end at the very last step. Now bounces to
        // the resume flow like every other step's session-expiry handling.
        // Returns before clearLocalState() below — the provider is about to
        // be routed through the resume flow, which resolves a fresh session
        // from Supabase Auth rather than from localStorage anyway, but there
        // is no reason to race a clear against the redirect.
        flagSessionExpired(tShell("sessionExpired"));
        router.replace("/onboarding");
        return;
      }
      // Any other failure intentionally leaves status as "checking" here —
      // unchanged from this file's prior behaviour: the loading message
      // stays up rather than a dead end.

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
    return (
      <div className="mt-6 space-y-6" aria-busy="true" aria-label={t("loading")}>
        <div className="space-y-3 rounded-lg border border-gray-200 p-4">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="space-y-2 rounded-lg border border-gray-200 p-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <CompletionCard institutionName={summary.institutionName} datasetTitle={summary.datasetTitle} providerSlug={summary.providerSlug} />
      <NextStepsTimeline />
      <UsdcRealitySection />
      <Button type="button" onClick={() => router.push("/dashboard")}>
        {t("dashboardLink")}
      </Button>

      <WhatHappensNext deployPath={deployPath} />

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-200 pt-4 text-sm">
        <Link href="/faq" className="text-ocean hover:underline">
          Frequently asked questions
        </Link>
        <Link href="/developers" className="text-ocean hover:underline">
          How buyers query your data
        </Link>
        <Link href="/for-providers" className="text-ocean hover:underline">
          Add another dataset
        </Link>
      </div>
    </div>
  );
}
