"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";

/**
 * Mandatory USDC off-ramp disclosure at first mention of USDC in the flow
 * (CLAUDE.md Section 15 / Section 11 "USDC off-ramp disclosure" — a
 * compliance requirement, not polish). UsdcRealitySection
 * (components/complete/UsdcRealitySection.tsx) covers the same ground at
 * Step 7, after the provider has already committed to a wallet — this is
 * the earlier disclosure, before they've set anything up, so "not
 * automatically convertible to local currency" is understood going in
 * rather than discovered after the fact.
 */
export function UsdcExplainer() {
  const t = useTranslations("Onboarding.Wallet.usdcExplainer");

  return (
    <Alert variant="info">
      <p className="font-semibold text-navy">{t("heading")}</p>
      <p className="mt-1">{t("body")}</p>
    </Alert>
  );
}
