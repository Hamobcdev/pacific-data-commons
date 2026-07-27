"use client";

import { useTranslations } from "next-intl";
import type { LiveVerificationStatus } from "@/lib/onboarding/state";
import { Alert } from "@/components/ui/alert";

export interface TrustTierExpectationProps {
  doiStatus: LiveVerificationStatus;
}

/**
 * Reactive, honest trust-tier expectation copy (CLAUDE.md Section 8).
 * Deliberately never says "Silver requires X in provenance" — Silver is
 * earned via 3 verified purchaser upvotes (Decision 28), not anything
 * declared here. This component only ever speaks to Bronze (always true at
 * registration) and Gold (contingent on a verified DOI).
 */
export function TrustTierExpectation({ doiStatus }: TrustTierExpectationProps) {
  const t = useTranslations("Onboarding.Provenance.trustTier");

  return (
    <Alert variant="info">
      <p className="font-medium">{t("heading")}</p>
      <p className="mt-1">{doiStatus === "verified" ? t("goldEligible") : t("bronzeOnly")}</p>
      <p className="mt-2 text-xs text-navy/70">{t("silverNote")}</p>
    </Alert>
  );
}
