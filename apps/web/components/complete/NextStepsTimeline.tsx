"use client";

import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const STEPS = ["review", "activation", "discovery", "payment", "silver"] as const;

export function NextStepsTimeline() {
  const t = useTranslations("Onboarding.Complete.timeline");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {STEPS.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-light-bg text-xs font-semibold text-navy">
                {index + 1}
              </span>
              <span className="text-sm text-gray-700">{t(step)}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
