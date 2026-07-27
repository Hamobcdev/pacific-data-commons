"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { verifyDoi } from "@/actions/onboarding/verify-doi";
import type { LiveVerificationStatus } from "@/lib/onboarding/state";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface DoiFieldProps {
  value: string;
  status: LiveVerificationStatus;
  verifiedTitle: string | null;
  onChange: (doi: string) => void;
  onResult: (status: LiveVerificationStatus, title: string | null) => void;
}

/** Debounced (800ms) live CrossRef DOI lookup — never blocks the form
 * (R5), same pattern as OrcidField. */
export function DoiField({ value, status, verifiedTitle, onChange, onResult }: DoiFieldProps) {
  const t = useTranslations("Onboarding.Provenance.doi");
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    const trimmed = localValue.trim();
    if (!trimmed) {
      onResult("unchecked", null);
      return;
    }

    onResult("checking", null);
    const timeout = setTimeout(() => {
      verifyDoi(trimmed).then((result) => {
        onResult(result.verified ? "verified" : "manual", result.title);
      });
    }, 800);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localValue]);

  return (
    <div>
      <label htmlFor="doi" className="block text-sm font-medium text-gray-700">
        {t("label")}
      </label>
      <Input
        id="doi"
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
          onChange(e.target.value);
        }}
        placeholder={t("placeholder")}
      />
      {status === "checking" && (
        <p className="mt-1 text-xs text-gray-500" role="status">
          {t("checking")}
        </p>
      )}
      {status === "verified" && (
        <div className="mt-1">
          <Badge variant="success">{t("verified")}</Badge>
          {verifiedTitle && <p className="mt-1 text-xs text-gray-600">{verifiedTitle}</p>}
        </div>
      )}
      {status === "manual" && (
        <p className="mt-1 text-xs text-amber-700" role="status">
          {t("manual")}
        </p>
      )}
    </div>
  );
}
