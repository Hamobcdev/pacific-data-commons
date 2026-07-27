"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { verifyOrcid } from "@/actions/onboarding/verify-orcid";
import type { LiveVerificationStatus } from "@/lib/onboarding/state";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface OrcidFieldProps {
  value: string;
  status: LiveVerificationStatus;
  verifiedName: string | null;
  onChange: (orcid: string) => void;
  onResult: (status: LiveVerificationStatus, name: string | null) => void;
}

/** Debounced (800ms) live ORCID lookup — never blocks the form, an
 * unreachable/invalid ORCID just falls back to "will be reviewed
 * manually" (R5). */
export function OrcidField({ value, status, verifiedName, onChange, onResult }: OrcidFieldProps) {
  const t = useTranslations("Onboarding.Provenance.orcid");
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
      verifyOrcid(trimmed).then((result) => {
        onResult(result.verified ? "verified" : "manual", result.name);
      });
    }, 800);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localValue]);

  return (
    <div>
      <Input
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
          onChange(e.target.value);
        }}
        placeholder={t("placeholder")}
        aria-label={t("label")}
      />
      {status === "checking" && (
        <p className="mt-1 text-xs text-gray-500" role="status">
          {t("checking")}
        </p>
      )}
      {status === "verified" && (
        <div className="mt-1">
          <Badge variant="success">{t("verified", { name: verifiedName ?? "" })}</Badge>
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
