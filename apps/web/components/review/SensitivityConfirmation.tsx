"use client";

import { useTranslations } from "next-intl";
import type { ReviewSensitivityState } from "@/lib/onboarding/state";

export interface SensitivityConfirmationProps {
  value: ReviewSensitivityState;
  onChange: <K extends keyof ReviewSensitivityState>(field: K, checked: boolean) => void;
}

const FIELDS: Array<keyof ReviewSensitivityState> = [
  "noPersonalData",
  "noTraditionalKnowledge",
  "noCulturallySensitive",
  "rightsHeld",
  "exportControlReviewed",
];

/**
 * CLAUDE.md P9 / R7: five sensitivity and sovereignty declarations, each
 * required and individually checked — deliberately NOT covered by "Accept
 * all AI suggestions" (see ReviewLayout). The Proceed button stays disabled
 * until every one of these is true; there is no partial-credit state.
 */
export function SensitivityConfirmation({ value, onChange }: SensitivityConfirmationProps) {
  const t = useTranslations("Onboarding.Review.sensitivity");

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h3 className="text-sm font-semibold text-navy">{t("title")}</h3>
      <p className="mt-1 text-xs text-gray-600">{t("subtitle")}</p>

      <fieldset className="mt-4 space-y-3">
        <legend className="sr-only">{t("title")}</legend>
        {FIELDS.map((field) => (
          <label key={field} className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={value[field]}
              onChange={(e) => onChange(field, e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-ocean focus:ring-ocean"
              required
            />
            {t(`items.${field}`)}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
