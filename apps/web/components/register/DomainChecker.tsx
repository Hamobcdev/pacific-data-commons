"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

export type DomainStatus = "unchecked" | "checking" | "verified" | "manual";

export function DomainChecker({ status }: { status: DomainStatus }) {
  const t = useTranslations("Onboarding.Register.domain");

  if (status === "unchecked") return null;

  if (status === "checking") {
    return (
      <p className="mt-1 text-xs text-gray-500" role="status">
        {t("checking")}
      </p>
    );
  }

  if (status === "verified") {
    return (
      <div className="mt-1">
        <Badge variant="success">{t("verified")}</Badge>
      </div>
    );
  }

  return (
    <p className="mt-1 text-xs text-amber-700" role="status">
      {t("manual")}
    </p>
  );
}
