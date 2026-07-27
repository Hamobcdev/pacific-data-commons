"use client";

import { useTranslations } from "next-intl";
import type { ReviewState } from "@/lib/onboarding/state";
import { DATA_CATEGORIES } from "@/lib/onboarding/validation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PricingTierEditor } from "./PricingTierEditor";

export interface StructuredOutputPanelProps {
  value: ReviewState;
  onChange: <K extends keyof ReviewState>(field: K, value: ReviewState[K]) => void;
  verifiedGovernment: boolean;
}

const DESCRIPTION_MAX = 500;

/** Right panel — the structured AI output, every field editable (CLAUDE.md
 * P9: LLM output is untrusted input, always shown for review, never
 * auto-applied). */
export function StructuredOutputPanel({ value, onChange, verifiedGovernment }: StructuredOutputPanelProps) {
  const t = useTranslations("Onboarding.Review.structured");
  const tCategories = useTranslations("Onboarding.Upload.categories");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          <div>
            <label htmlFor="reviewTitle" className="block text-sm font-medium text-gray-700">
              {t("fields.title")}
            </label>
            <Input id="reviewTitle" value={value.title} onChange={(e) => onChange("title", e.target.value)} required />
          </div>

          <div>
            <label htmlFor="reviewDescription" className="block text-sm font-medium text-gray-700">
              {t("fields.description")}
            </label>
            <Textarea
              id="reviewDescription"
              value={value.description}
              maxLength={DESCRIPTION_MAX}
              onChange={(e) => onChange("description", e.target.value)}
              required
            />
            <p className="mt-1 text-right text-xs text-gray-400">
              {value.description.length}/{DESCRIPTION_MAX}
            </p>
          </div>

          <div>
            <label htmlFor="reviewCategory" className="block text-sm font-medium text-gray-700">
              {t("fields.category")}
            </label>
            <Select
              id="reviewCategory"
              value={value.category}
              onChange={(e) => onChange("category", e.target.value as ReviewState["category"])}
              options={DATA_CATEGORIES.map((c) => ({ value: c, label: tCategories(c) }))}
              placeholder={t("fields.categoryPlaceholder")}
              required
            />
          </div>

          <div>
            <label htmlFor="reviewSubCategory" className="block text-sm font-medium text-gray-700">
              {t("fields.subCategory")}
            </label>
            <Input id="reviewSubCategory" value={value.subCategory} onChange={(e) => onChange("subCategory", e.target.value)} />
          </div>

          <div>
            <label htmlFor="reviewGeography" className="block text-sm font-medium text-gray-700">
              {t("fields.geography")}
            </label>
            <Input
              id="reviewGeography"
              value={value.geography}
              onChange={(e) => onChange("geography", e.target.value)}
              placeholder={t("fields.geographyPlaceholder")}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="reviewPeriodStart" className="block text-sm font-medium text-gray-700">
                {t("fields.periodStart")}
              </label>
              <Input
                id="reviewPeriodStart"
                inputMode="numeric"
                value={value.timePeriodStart}
                onChange={(e) => onChange("timePeriodStart", e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="reviewPeriodEnd" className="block text-sm font-medium text-gray-700">
                {t("fields.periodEnd")}
              </label>
              <Input
                id="reviewPeriodEnd"
                inputMode="numeric"
                value={value.timePeriodEnd}
                onChange={(e) => onChange("timePeriodEnd", e.target.value)}
                required
              />
            </div>
          </div>

          <PricingTierEditor
            value={value.pricing}
            verifiedGovernment={verifiedGovernment}
            onChange={(tier, overridePriceUsdc) =>
              onChange(
                "pricing",
                value.pricing.map((row) => (row.tier === tier ? { ...row, overridePriceUsdc } : row)),
              )
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
