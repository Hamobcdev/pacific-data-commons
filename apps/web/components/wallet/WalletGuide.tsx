"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

const GUIDE_STEPS = ["install", "create", "optin"] as const;
type GuideStepId = (typeof GUIDE_STEPS)[number];

export interface WalletGuideProps {
  onAllConfirmed: (confirmed: boolean) => void;
}

/**
 * Illustrated step-by-step Pera wallet setup guide: install -> create
 * (with the seed-phrase-safety warning) -> opt in to USDC. Each card has
 * its own confirmation checkbox; the provider cannot move on to pasting
 * their address (WalletInput) until every step is checked — this is the
 * highest-anxiety screen for a non-technical user, so nothing here should
 * feel skippable or glossed over.
 */
export function WalletGuide({ onAllConfirmed }: WalletGuideProps) {
  const t = useTranslations("Onboarding.Wallet.guide");
  const [confirmed, setConfirmed] = useState<Record<GuideStepId, boolean>>({ install: false, create: false, optin: false });

  const toggle = (step: GuideStepId) => {
    const updated = { ...confirmed, [step]: !confirmed[step] };
    setConfirmed(updated);
    onAllConfirmed(GUIDE_STEPS.every((s) => updated[s]));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>{t("step1_title")}</CardTitle>
        <CardContent className="mt-2">{t("step1_body")}</CardContent>
        <GuideCheckbox id="guide-install" checked={confirmed.install} onChange={() => toggle("install")} label={t("confirm")} />
      </Card>

      <Card>
        <CardTitle>{t("step2_title")}</CardTitle>
        <CardContent className="mt-2">{t("step2_body")}</CardContent>
        <Alert variant="warning" className="mt-3">
          {t("seed_warning")}
        </Alert>
        <GuideCheckbox id="guide-create" checked={confirmed.create} onChange={() => toggle("create")} label={t("confirm")} />
      </Card>

      <Card>
        <CardTitle>{t("step3_title")}</CardTitle>
        <CardContent className="mt-2">{t("step3_body")}</CardContent>
        <p className="mt-2 text-xs text-gray-500">{t("algo_requirement")}</p>
        <GuideCheckbox id="guide-optin" checked={confirmed.optin} onChange={() => toggle("optin")} label={t("confirm")} />
      </Card>
    </div>
  );
}

function GuideCheckbox({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label htmlFor={id} className="mt-3 flex items-start gap-2 text-sm text-gray-700">
      <input id={id} type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-ocean focus:ring-ocean" />
      {label}
    </label>
  );
}
