"use client";

import { useTranslations } from "next-intl";
import type { ReviewPricingRow } from "@/lib/onboarding/state";
import { BRONZE_CAPPED_TIERS, BRONZE_PRICE_CAP_USDC } from "@/lib/onboarding/tiers";
import { Input } from "@/components/ui/input";

export interface PricingTierEditorProps {
  value: ReviewPricingRow[];
  onChange: (tier: ReviewPricingRow["tier"], overridePriceUsdc: string) => void;
  /** Bypasses the Bronze Tier 1-2 price cap — Decision 23 OGIP government exception. */
  verifiedGovernment: boolean;
}

/** One editor row per pricing tier (Tier 1-5). AI suggested price is
 * read-only/grey; the provider's override is the only writable value.
 * Tier 1-2 rows show an inline cap warning for non-government Bronze
 * providers exceeding $0.50 (Decision 23) — a warning, not a hard block,
 * since save-review.ts enforces the cap server-side regardless. */
export function PricingTierEditor({ value, onChange, verifiedGovernment }: PricingTierEditorProps) {
  const t = useTranslations("Onboarding.Review.pricing");

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-navy">{t("title")}</h3>
      {value.map((row) => {
        const overExceedsCap =
          !verifiedGovernment && (BRONZE_CAPPED_TIERS as readonly number[]).includes(row.tier) && Number(row.overridePriceUsdc) > BRONZE_PRICE_CAP_USDC;

        return (
          <div key={row.tier} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-navy">
                  {t("tierLabel", { tier: row.tier })} — {row.name}
                </p>
                <p className="text-xs text-gray-500">{row.description}</p>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500">{t("aiSuggested")}</label>
                <p className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                  ${row.aiSuggestedPriceUsdc.toFixed(2)}
                </p>
              </div>
              <div>
                <label htmlFor={`price-tier-${row.tier}`} className="block text-xs text-gray-500">
                  {t("override")}
                </label>
                <Input
                  id={`price-tier-${row.tier}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.overridePriceUsdc}
                  onChange={(e) => onChange(row.tier, e.target.value)}
                  invalid={overExceedsCap}
                />
              </div>
            </div>
            {overExceedsCap && <p className="mt-1 text-xs text-amber-700">{t("capWarning", { cap: BRONZE_PRICE_CAP_USDC.toFixed(2) })}</p>}
          </div>
        );
      })}
    </div>
  );
}
