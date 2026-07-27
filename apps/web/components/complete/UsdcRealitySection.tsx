"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";

/**
 * Mandatory, honest USDC disclosure (CLAUDE.md Section 15 / Section 11
 * "USDC off-ramp disclosure"). The body text below is a direct rendering of
 * the exact copy specified in the Session 6 brief — do not soften ("it's
 * easy") or harden it; translate it faithfully in non-English locales
 * rather than paraphrasing.
 */
export function UsdcRealitySection() {
  const t = useTranslations("Onboarding.Complete.usdcReality");

  return (
    <Alert variant="info">
      <p className="font-semibold text-navy">{t("heading")}</p>
      <p className="mt-2">{t("body")}</p>
    </Alert>
  );
}
