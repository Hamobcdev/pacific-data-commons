"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export interface StepNavProps {
  onBack?: () => void;
  onNext?: () => void;
  nextType?: "button" | "submit";
  nextDisabled?: boolean;
  nextLabel: string;
  isSubmitting?: boolean;
  submittingLabel?: string;
}

/** Back/Next navigation shared by every onboarding step. `nextDisabled`
 * comes from the step's own zod validation state — StepNav never validates
 * itself, it just reflects what the caller already knows. */
export function StepNav({ onBack, onNext, nextType = "button", nextDisabled, nextLabel, isSubmitting, submittingLabel }: StepNavProps) {
  const t = useTranslations("Onboarding.nav");

  return (
    <div className="flex items-center justify-between pt-4">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack} disabled={isSubmitting}>
          {t("back")}
        </Button>
      ) : (
        <span />
      )}
      <Button type={nextType} onClick={nextType === "button" ? onNext : undefined} disabled={nextDisabled || isSubmitting}>
        {isSubmitting ? (submittingLabel ?? t("saving")) : nextLabel}
      </Button>
    </div>
  );
}
