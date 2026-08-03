"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { saveWallet } from "@/actions/onboarding/save-wallet";
import { loadLocalState, saveLocalState, defaultState, type OnboardingState } from "@/lib/onboarding/state";
import { checkAddressFormat } from "@/lib/algorand/validate";
import { WalletGuide } from "./WalletGuide";
import { WalletInput } from "./WalletInput";
import { UsdcOptInGuide } from "./UsdcOptInGuide";
import { Alert } from "@/components/ui/alert";
import { StepNav } from "@/components/onboarding/StepNav";

type WalletFormState = OnboardingState["wallet"];

export function WalletForm() {
  const t = useTranslations("Onboarding.Wallet");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guideConfirmed, setGuideConfirmed] = useState(false);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [institutionName, setInstitutionName] = useState("");
  const [form, setForm] = useState<WalletFormState>(() => loadLocalState()?.wallet ?? defaultState().wallet);

  useEffect(() => {
    const state = loadLocalState();
    if (!state?.providerId || !state.sessionToken) {
      // No registration on record for this device/session — send them back
      // to Step 1 rather than showing a wallet form with nothing to attach
      // it to (R5: no dead ends).
      router.replace("/onboarding/register");
      return;
    }
    setProviderId(state.providerId);
    setSessionToken(state.sessionToken);
    setInstitutionName(state.registration.institutionName);
  }, [router]);

  const persist = (updated: WalletFormState) => {
    setForm(updated);
    const state = loadLocalState() ?? defaultState();
    saveLocalState({ ...state, wallet: updated });
  };

  const addressFormatValid = checkAddressFormat(form.walletAddress).valid;
  const canSubmit = guideConfirmed && addressFormatValid && form.hasInstitutionalAuthority === true;

  const handleSubmit = () => {
    if (!providerId || !sessionToken) return;
    setError(null);
    startTransition(async () => {
      const result = await saveWallet(providerId, sessionToken, form.walletAddress, form.hasInstitutionalAuthority === true);
      if (result.success) {
        persist({ ...form, walletVerified: true, usdcOptedIn: result.usdcOptedIn });
        const state = loadLocalState() ?? defaultState();
        saveLocalState({ ...state, currentStep: "upload" });
        router.push("/onboarding/upload");
      } else {
        setError(result.error ?? t("genericError"));
      }
    });
  };

  if (!providerId || !sessionToken) return null;

  return (
    <div className="mt-6 space-y-6">
      <WalletGuide onAllConfirmed={setGuideConfirmed} />

      {guideConfirmed && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-700">{t("custody.question")}</p>
            <p className="mt-1 text-sm text-gray-600">{t("custody.recommendation")}</p>
            <a href="/downloads/finance-office-brief.pdf" className="mt-2 inline-block text-sm text-ocean hover:underline">
              {t("custody.guide_download")}
            </a>
          </div>

          <WalletInput
            value={form.walletAddress}
            onChange={(address) => persist({ ...form, walletAddress: address })}
            onUsdcStatusChange={(usdcOptedIn) => persist({ ...form, walletAddress: form.walletAddress, usdcOptedIn })}
          />

          {addressFormatValid && form.usdcOptedIn === false && <UsdcOptInGuide />}

          <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.hasInstitutionalAuthority === true}
              onChange={(e) => persist({ ...form, hasInstitutionalAuthority: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-ocean focus:ring-ocean"
            />
            {t("authority.label", { institutionName: institutionName || t("authority.fallbackInstitution") })}
          </label>

          {error && <Alert variant="error">{error}</Alert>}

          <StepNav
            onBack={() => router.push("/onboarding/register")}
            onNext={handleSubmit}
            nextDisabled={!canSubmit}
            nextLabel={t("continue")}
            isSubmitting={isPending}
          />
        </>
      )}
    </div>
  );
}
