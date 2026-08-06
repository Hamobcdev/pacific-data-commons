"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { checkWalletAddress } from "@/actions/onboarding/check-wallet";
import { checkAddressFormat } from "@/lib/algorand/validate";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface WalletInputProps {
  value: string;
  onChange: (value: string) => void;
  onUsdcStatusChange: (usdcOptedIn: boolean | null) => void;
}

type CheckState = "idle" | "checking" | "invalid" | "checked";

/** Algorand address input with live format validation and a debounced,
 * real-time USDC opt-in check (via check-wallet.ts — read-only, no DB
 * write). Never blocks progress if the node is unreachable — shows
 * "will verify manually" instead (R5). */
export function WalletInput({ value, onChange, onUsdcStatusChange }: WalletInputProps) {
  const t = useTranslations("Onboarding.Wallet.address");
  const [state, setState] = useState<CheckState>("idle");
  const [usdcOptedIn, setUsdcOptedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setState("idle");
      return;
    }

    const format = checkAddressFormat(trimmed);
    if (!format.valid) {
      setState("invalid");
      return;
    }

    setState("checking");
    let cancelled = false;
    const timeout = setTimeout(() => {
      checkWalletAddress(trimmed).then((result) => {
        if (cancelled) return;
        setState("checked");
        setUsdcOptedIn(result.usdcOptedIn);
        onUsdcStatusChange(result.usdcOptedIn);
      });
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div>
      <label htmlFor="walletAddress" className="form-label block text-gray-700">
        {t("label")}
      </label>
      <Input
        id="walletAddress"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder={t("placeholder")}
        invalid={state === "invalid"}
        required
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {state === "invalid" && <p className="text-xs text-red-600">{t("not_verified")}</p>}
        {state === "checking" && <p className="text-xs text-gray-500">{t("checking")}</p>}
        {state === "checked" && (
          <>
            <Badge variant="success">{t("verified")}</Badge>
            {usdcOptedIn === true && <Badge variant="success">{t("usdc_opted_in")}</Badge>}
            {usdcOptedIn === false && <Badge variant="warning">{t("usdc_not_opted")}</Badge>}
            {usdcOptedIn === null && <Badge variant="neutral">{t("usdc_unknown")}</Badge>}
          </>
        )}
      </div>
    </div>
  );
}
