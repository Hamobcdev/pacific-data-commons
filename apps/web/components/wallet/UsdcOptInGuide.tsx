"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";

/** Shown when WalletInput detects a valid, real Algorand address that has
 * not opted in to USDC yet — the "orange warning ... with fix instructions"
 * state from the Step 2 spec. Never blocks continuing (R5); the provider
 * can fix this later and re-check. */
export function UsdcOptInGuide() {
  const t = useTranslations("Onboarding.Wallet.usdcOptIn");

  return (
    <Alert variant="warning">
      <p className="font-medium">{t("title")}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-4">
        <li>{t("step1")}</li>
        <li>{t("step2")}</li>
        <li>{t("step3")}</li>
      </ol>
      <p className="mt-2 text-xs">{t("recheck_note")}</p>
    </Alert>
  );
}
