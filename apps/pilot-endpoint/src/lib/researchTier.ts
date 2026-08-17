import { ValidationError } from "./errors.js";

const VALID_RESEARCH_TIERS = ["summary", "slice", "full"] as const;
export type ResearchTier = (typeof VALID_RESEARCH_TIERS)[number];

/**
 * Shared tier-resolution for the three research routes (Session 23,
 * Decision 42). `summary` (default) returns the paper's top-level const
 * unchanged. `slice` returns one named section — or every section, if
 * `section` is omitted. `full` returns the summary plus every section.
 * All three are priced identically (TIER_PRICING.summary) in index.ts —
 * see research.ts's doc comment for why depth isn't a paywall lever here.
 *
 * Thrown before any data is built, matching sliceRoute's pattern: an
 * invalid tier/section never reaches the response, so the verified
 * payment gets cancelled rather than settled (@pdc/x402-adapter).
 */
export function resolveResearchTier<S extends Record<string, { title: string; content: string }>>(
  query: Record<string, string | undefined>,
  base: Record<string, unknown>,
  sections: S,
): Record<string, unknown> {
  const tierRaw = query.tier ?? "summary";
  if (!VALID_RESEARCH_TIERS.includes(tierRaw as ResearchTier)) {
    throw new ValidationError(`Invalid tier "${tierRaw}". Must be one of: ${VALID_RESEARCH_TIERS.join(", ")}.`);
  }
  const tier = tierRaw as ResearchTier;

  if (tier === "summary") {
    return base;
  }

  if (tier === "full") {
    return { ...base, sections };
  }

  // tier === "slice"
  const sectionKey = query.section;
  if (sectionKey === undefined) {
    return { ...base, tier: "slice", sections };
  }
  if (!(sectionKey in sections)) {
    throw new ValidationError(`Invalid section "${sectionKey}". Must be one of: ${Object.keys(sections).join(", ")}.`);
  }
  return { ...base, tier: "slice", section: sectionKey, ...sections[sectionKey] };
}
