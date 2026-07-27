"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

const STEPS = ["register", "wallet", "upload", "review", "provenance", "deploy", "complete"] as const;

export interface StepIndicatorProps {
  /** 1-7 */
  currentStep: number;
  totalSteps?: number;
}

export function StepIndicator({ currentStep, totalSteps = 7 }: StepIndicatorProps) {
  const t = useTranslations("Onboarding.steps");

  return (
    <div className="w-full">
      {/* Mobile: just "Step X of Y" (R6 — keep it light) */}
      <div className="sm:hidden text-sm text-gray-500">
        {t("stepOf", { current: currentStep, total: totalSteps, name: t(STEPS[currentStep - 1]) })}
      </div>

      {/* Desktop: show all steps */}
      <div className="hidden sm:flex items-center gap-1">
        {STEPS.map((step, index) => {
          const stepNum = index + 1;
          const isComplete = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;

          return (
            <div key={step} className="flex items-center">
              <div
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium",
                  isComplete && "text-ocean",
                  isCurrent && "text-navy font-semibold",
                  !isComplete && !isCurrent && "text-gray-400",
                )}
              >
                <span
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-xs",
                    isComplete && "bg-ocean text-white",
                    isCurrent && "bg-navy text-white",
                    !isComplete && !isCurrent && "bg-gray-200 text-gray-500",
                  )}
                >
                  {isComplete ? "✓" : stepNum}
                </span>
                {t(step)}
              </div>
              {index < STEPS.length - 1 && <div className={cn("w-4 h-px mx-1", stepNum < currentStep ? "bg-ocean" : "bg-gray-200")} />}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
        <div
          className="bg-ocean h-1 rounded-full transition-all duration-300"
          style={{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}
