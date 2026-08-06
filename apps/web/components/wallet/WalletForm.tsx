"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { saveWallet } from "@/actions/onboarding/save-wallet";
import { loadLocalState, saveLocalState, defaultState, type OnboardingState } from "@/lib/onboarding/state";
import { checkAddressFormat } from "@/lib/algorand/validate";
import { SESSION_EXPIRED_ERROR } from "@/lib/onboarding/session-constants";
import { flagSessionExpired } from "@/lib/onboarding/flag-session-expired";
import { WalletGuide } from "./WalletGuide";
import { WalletInput } from "./WalletInput";
import { UsdcOptInGuide } from "./UsdcOptInGuide";
import { UsdcExplainer } from "./UsdcExplainer";
import { Alert } from "@/components/ui/alert";
import { StepNav } from "@/components/onboarding/StepNav";

type WalletFormState = OnboardingState["wallet"];

export function WalletForm() {
  const t = useTranslations("Onboarding.Wallet");
  const tShell = useTranslations("Onboarding.shell");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guideConfirmed, setGuideConfirmed] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [institutionName, setInstitutionName] = useState("");
  const [form, setForm] = useState<WalletFormState>(() => loadLocalState()?.wallet ?? defaultState().wallet);

  // "checking" during the SSR pass and the first client render (localStorage
  // is never readable server-side, so providerId/sessionToken genuinely
  // can't be known yet); "redirecting" once loadLocalState() has actually
  // run and confirmed there's nothing to resume; "ready" once both are
  // confirmed present. Previously this component just `return null`ed for
  // both the "still checking" and "confirmed missing" cases — on a slow
  // connection (CLAUDE.md P8: intermittent, high-latency Pacific links) that
  // renders as an indefinite blank page below the step indicator, which
  // reads exactly like "couldn't reach page" even though the server
  // response itself succeeded (this page has no server-side data dependency
  // at all — see wallet/page.tsx). R5: no dead ends, never a blank screen.
  const [status, setStatus] = useState<"checking" | "redirecting" | "ready">("checking");

  useEffect(() => {
    const state = loadLocalState();
    if (!state?.providerId || !state.sessionToken) {
      // No registration on record for this device/session — send them back
      // to Step 1 rather than showing a wallet form with nothing to attach
      // it to (R5: no dead ends).
      setStatus("redirecting");
      router.replace("/onboarding/register");
      return;
    }
    setProviderId(state.providerId);
    setSessionToken(state.sessionToken);
    setInstitutionName(state.registration.institutionName);
    setStatus("ready");
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
      } else if (result.error === SESSION_EXPIRED_ERROR) {
        flagSessionExpired(tShell("sessionExpired"));
        router.push("/onboarding");
      } else {
        setError(result.error ?? t("genericError"));
      }
    });
  };

  if (status === "checking") {
    return <p className="mt-6 text-sm text-gray-500">{t("loading")}</p>;
  }

  if (status === "redirecting" || !providerId || !sessionToken) {
    return <p className="mt-6 text-sm text-gray-500">{t("redirecting")}</p>;
  }

  return (
    <div className="mt-6 space-y-6">
      <UsdcExplainer />
      <WalletGuide onAllConfirmed={setGuideConfirmed} />

      {guideConfirmed && (
        <>
          <p className="text-base text-gray-600">
            {t("custody.question")} {t("custody.recommendation")}{" "}
            <Link href="/downloads/finance-office-brief" className="text-xs text-gray-400 hover:text-ocean hover:underline">
              {t("custody.guide_download")}
            </Link>
          </p>

          <div>
            <WalletInput
              value={form.walletAddress}
              onChange={(address) => persist({ ...form, walletAddress: address })}
              onUsdcStatusChange={(usdcOptedIn) => persist({ ...form, walletAddress: form.walletAddress, usdcOptedIn })}
            />
            <p className="mt-1.5 text-xs text-gray-500">{t("address.hint")}</p>
            <p className="mt-1 text-xs text-gray-400">{t("address.publicNote")}</p>
          </div>

          {addressFormatValid && form.usdcOptedIn === false && <UsdcOptInGuide />}

          <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-4 text-base text-gray-700">
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

      <div className="border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={() => setSecurityOpen((open) => !open)}
          className="flex w-full items-center justify-between text-left text-base font-medium text-gray-700"
          aria-expanded={securityOpen}
        >
          <span>
            🔒 {t("security.title")} {securityOpen ? "▲" : "▼"}
          </span>
        </button>
        {securityOpen && (
          <div className="mt-3 space-y-2 text-base text-gray-600">
            <p>{t("security.note")}</p>
            <a
              href="https://support.perawallet.app/en/article/how-to-keep-your-algorand-account-safe-1e8k6q7/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-ocean hover:underline"
            >
              → {t("security.link")}
            </a>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">ℹ️ {t("rocca.note")}</p>
    </div>
  );
}
