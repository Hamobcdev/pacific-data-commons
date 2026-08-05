"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardTitle, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type WalletPath = "smartphone" | "computer" | "help";

const PATH_STEPS = ["download", "backup", "usdc"] as const;
type PathStepId = (typeof PATH_STEPS)[number];

const PERA_IOS_URL = "https://apps.apple.com/app/pera-algo-wallet/id1459712281";
const PERA_ANDROID_URL = "https://play.google.com/store/apps/details?id=com.algorand.android";
const PERA_GUIDE_URL = "https://support.perawallet.app/en/article/create-an-algorand-account-with-pera-wallet-1ehbj11/";
const LUTE_INSTALL_URL = "https://chromewebstore.google.com/detail/lute/kiaoohollfkjhikdifohdckeidckokjh";
const LUTE_GUIDE_URL = "https://lute.app/";
const ASSISTANT_EMAIL_URL = "mailto:anthony@synergybcpacific.com?subject=Wallet%20Setup%20Help";

export interface WalletGuideProps {
  onAllConfirmed: (confirmed: boolean) => void;
}

/**
 * Guided wallet setup (plain-language hotfix). The provider picks their
 * device -- smartphone (Pera), computer (Lute), or "I need help" -- and
 * gets one specific path instead of a single generic, jargon-heavy
 * checklist. No blockchain terms in this primary flow: "25-word backup"
 * not "seed phrase", "Add USDC to your wallet" not "opt in", no ASA/
 * WalletConnect mentions. Replaces the previous Pera-only install/create/
 * optin checklist.
 *
 * onAllConfirmed keeps the same boolean contract WalletForm already gates
 * on: true once all three step confirmations for the *active* device path
 * are checked. Switching paths resets those confirmations (nothing here
 * persists -- a refresh or a path change just starts the checklist over).
 * The "help" path never confirms -- it's a dead end to contact SBP, not a
 * wallet-creation path.
 */
export function WalletGuide({ onAllConfirmed }: WalletGuideProps) {
  const t = useTranslations("Onboarding.Wallet");
  const [path, setPath] = useState<WalletPath | null>(null);
  const [confirmed, setConfirmed] = useState<Record<PathStepId, boolean>>({ download: false, backup: false, usdc: false });

  const selectPath = (next: WalletPath | null) => {
    setPath(next);
    setConfirmed({ download: false, backup: false, usdc: false });
    onAllConfirmed(false);
  };

  const toggle = (step: PathStepId) => {
    const updated = { ...confirmed, [step]: !confirmed[step] };
    setConfirmed(updated);
    onAllConfirmed(PATH_STEPS.every((s) => updated[s]));
  };

  if (!path) {
    return (
      <Card>
        <CardTitle>{t("path.prompt")}</CardTitle>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => selectPath("smartphone")}>
            📱 {t("path.smartphone")}
          </Button>
          <Button type="button" variant="secondary" className="flex-1" onClick={() => selectPath("computer")}>
            💻 {t("path.computer")}
          </Button>
        </div>
        <button type="button" onClick={() => selectPath("help")} className="mt-3 text-sm text-ocean hover:underline">
          ❓ {t("path.help")}
        </button>
      </Card>
    );
  }

  const changePathLink = (
    <button type="button" onClick={() => selectPath(null)} className="text-sm text-gray-500 hover:text-ocean hover:underline">
      ← {t("path.change")}
    </button>
  );

  if (path === "help") {
    return (
      <Card>
        {changePathLink}
        <CardTitle className="mt-3">💬 {t("path.helpBlock.title")}</CardTitle>
        <CardContent className="mt-2">{t("path.helpBlock.prompt")}</CardContent>
        <div className="mt-4 flex flex-col items-start gap-2">
          <a href={ASSISTANT_EMAIL_URL}>
            <Button type="button">{t("path.helpBlock.chatButton")}</Button>
          </a>
          <p className="text-sm text-gray-500">
            {t("path.helpBlock.emailPrompt")}{" "}
            <a href="mailto:anthony@synergybcpacific.com" className="text-ocean hover:underline">
              anthony@synergybcpacific.com
            </a>
          </p>
        </div>
      </Card>
    );
  }

  const isSmartphone = path === "smartphone";
  // Dotted key paths within the already-scoped "Onboarding.Wallet" namespace
  // -- not a second useTranslations() call -- so this stays below the two
  // early returns above without breaking the Rules of Hooks (every hook in
  // this component now runs on every render, regardless of `path`).
  const stepsPrefix = isSmartphone ? "path.smartphoneSteps" : "path.computerSteps";

  return (
    <div className="space-y-4">
      {changePathLink}

      <Card>
        <CardTitle>{t(`${stepsPrefix}.step1_title`)}</CardTitle>
        <CardContent className="mt-2">{t(`${stepsPrefix}.step1_body`)}</CardContent>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          {isSmartphone ? (
            <>
              <a href={PERA_IOS_URL} target="_blank" rel="noopener noreferrer" className="text-ocean hover:underline">
                → {t("path.smartphoneSteps.step1_ios")}
              </a>
              <a href={PERA_ANDROID_URL} target="_blank" rel="noopener noreferrer" className="text-ocean hover:underline">
                → {t("path.smartphoneSteps.step1_android")}
              </a>
            </>
          ) : (
            <a href={LUTE_INSTALL_URL} target="_blank" rel="noopener noreferrer" className="text-ocean hover:underline">
              → {t("path.computerSteps.step1_link")}
            </a>
          )}
        </div>
        <StepCheckbox id="guide-step1" checked={confirmed.download} onChange={() => toggle("download")} label={t(`${stepsPrefix}.step1_confirm`)} />
      </Card>

      <Card>
        <CardTitle>{t(`${stepsPrefix}.step2_title`)}</CardTitle>
        <CardContent className="mt-2">{t(`${stepsPrefix}.step2_body`)}</CardContent>
        <a
          href={isSmartphone ? PERA_GUIDE_URL : LUTE_GUIDE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm text-ocean hover:underline"
        >
          → {t(`${stepsPrefix}.step2_guide`)}
        </a>
        <Alert variant="warning" className="mt-3">
          {t("backupWarning")}
        </Alert>
        <StepCheckbox id="guide-step2" checked={confirmed.backup} onChange={() => toggle("backup")} label={t("backupConfirm")} />
      </Card>

      <Card>
        <CardTitle>{t(`${stepsPrefix}.step3_title`)}</CardTitle>
        <CardContent className="mt-2">{t(`${stepsPrefix}.step3_body`)}</CardContent>
        <p className="mt-2 text-xs text-gray-500">{t("algoCredit")}</p>
        <StepCheckbox id="guide-step3" checked={confirmed.usdc} onChange={() => toggle("usdc")} label={t(`${stepsPrefix}.step3_confirm`)} />
      </Card>

      <Card>
        <CardTitle>{t(`${stepsPrefix}.step4_title`)}</CardTitle>
        <CardContent className="mt-2">{t(`${stepsPrefix}.step4_body`)}</CardContent>
      </Card>
    </div>
  );
}

function StepCheckbox({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label htmlFor={id} className="mt-3 flex items-start gap-2 text-sm text-gray-700">
      <input id={id} type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-ocean focus:ring-ocean" />
      {label}
    </label>
  );
}
