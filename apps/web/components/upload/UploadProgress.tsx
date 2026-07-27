"use client";

import { useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";

export function UploadProgress({ percent }: { percent: number }) {
  const t = useTranslations("Onboarding.Upload");

  return (
    <div className="mt-1">
      <Progress value={percent} label={`${percent}%`} />
      <p className="mt-1 text-xs text-gray-500">{t("safe_to_close")}</p>
    </div>
  );
}
