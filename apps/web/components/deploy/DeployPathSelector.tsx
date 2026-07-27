"use client";

import { useTranslations } from "next-intl";
import type { DeployPath } from "@/lib/onboarding/state";
import { cn } from "@/lib/cn";

export interface DeployPathSelectorProps {
  value: DeployPath | "";
  onChange: (path: DeployPath) => void;
}

/** Path A (SBP Managed) is the default/recommended option — CLAUDE.md
 * Decision 4: "Hybrid — SBP managed during POC, self-host post-competition." */
export function DeployPathSelector({ value, onChange }: DeployPathSelectorProps) {
  const t = useTranslations("Onboarding.Deploy.pathSelector");

  const options: Array<{ path: DeployPath; title: string; description: string; recommended: boolean }> = [
    { path: "sbp_managed", title: t("sbpManaged.title"), description: t("sbpManaged.description"), recommended: true },
    { path: "self_hosted", title: t("selfHosted.title"), description: t("selfHosted.description"), recommended: false },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {options.map((option) => (
        <button
          key={option.path}
          type="button"
          onClick={() => onChange(option.path)}
          className={cn(
            "rounded-lg border p-4 text-left transition-colors",
            value === option.path ? "border-ocean bg-light-bg" : "border-gray-200 bg-white hover:border-ocean/50",
          )}
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-navy">{option.title}</span>
            {option.recommended && (
              <span className="rounded-full bg-ocean/10 px-2 py-0.5 text-xs font-medium text-ocean">{t("recommended")}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600">{option.description}</p>
        </button>
      ))}
    </div>
  );
}
