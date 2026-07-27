import type { ReviewPricingRow } from "./state";

/**
 * Default per-tier pricing metadata shown in Step 4's editor. Mirrors the
 * five-tier structure every provider endpoint template uses (see
 * apps/pilot-endpoint/src/lib/pricing.ts TIER_PRICING) — these are the
 * "AI suggested" starting prices a provider sees before overriding. No live
 * AI pricing-recommendation pipeline exists in this repo yet
 * (formatting_runs.stage_pricing_rec is never populated by anything — see
 * Session 6 report), so these are the same sane tier defaults the pilot
 * endpoint itself ships with, not a model's per-dataset recommendation.
 */
export const DEFAULT_REVIEW_PRICING: ReviewPricingRow[] = [
  { tier: 1, name: "Summary", description: "Key findings summary and headline statistics.", aiSuggestedPriceUsdc: 0.01, overridePriceUsdc: "0.01" },
  { tier: 2, name: "Slice", description: "Filtered data slice by parameters (date range, region, category).", aiSuggestedPriceUsdc: 0.5, overridePriceUsdc: "0.50" },
  { tier: 3, name: "Full", description: "Complete dataset, all records.", aiSuggestedPriceUsdc: 25.0, overridePriceUsdc: "25.00" },
  { tier: 4, name: "Expert", description: "Full dataset plus methodology notes and citation-ready format.", aiSuggestedPriceUsdc: 200.0, overridePriceUsdc: "200.00" },
  { tier: 5, name: "Commission", description: "Custom commissioned query — SBP/provider follow up directly.", aiSuggestedPriceUsdc: 1000.0, overridePriceUsdc: "1000.00" },
];

/** Decision 23 — Bronze providers are capped on Tier 1-2 only, unless they
 * carry the verified_government flag (OGIP government track bypass). */
export const BRONZE_PRICE_CAP_USDC = 0.5;
export const BRONZE_CAPPED_TIERS = [1, 2] as const;
