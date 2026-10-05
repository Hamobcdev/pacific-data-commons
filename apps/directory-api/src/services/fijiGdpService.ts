// fijiGdpService.ts
//
// Fiji GDP by industry — transcribed directly from the Fiji Bureau of
// Statistics' own published rebase release (not a third-party
// aggregation via an intermediary API). Decision 42 applies here, not
// Decision 59/60: this is a structured queryable endpoint over an
// openly-accessible government report, Tier 1 capped, underlying
// document never paywalled. Same posture as samoaGdpService.ts.
//
// Source: Fiji Bureau of Statistics, "Gross Domestic Product — Rebase to
// 2019", FBoS Release No. 62, published 3 September 2025
// (www.statsfiji.gov.fj).
//
// Static data, not a live upstream fetch: FBoS publishes this
// release-by-release, not via a queryable API, so there is nothing to
// poll or cache-invalidate here — figures are updated by hand when FBoS
// publishes a new release (same posture as samoaGdpService.ts).
//
// Detailed industry-by-industry breakdown is published only for 2019
// (the new rebase base year) in the release's appendix — 2020–2024 are
// reported as total GDP plus real growth rate only. Rather than
// fabricating an industry split for years FBoS hasn't published one for,
// the two years shapes below are deliberately different
// (detail_level discriminant), same "never invent a number" posture as
// samoaGdpService.ts's null sub-fields for unpublished data.

export const SOURCE_ATTRIBUTION = {
  source: "Fiji Bureau of Statistics",
  source_document: "Gross Domestic Product — Rebase to 2019, FBoS Release No. 62",
  published: "2025-09-03",
  source_url: "https://www.statsfiji.gov.fj",
  data_quality: "government_source_transcribed" as const,
  license: "Open government data — attribution required",
  disclaimer:
    "This endpoint reproduces figures transcribed directly from the Fiji Bureau of Statistics' own published release (Decision 42 — governance/research endpoint, Tier 1 capped, underlying document openly accessible, never paywalled). SBP has transcribed these values but has not independently audited FBoS's own methodology or source data — this is not an FBoS-certified live feed, and any discrepancy should be checked against the original release at the source_url above.",
};

export interface FijiGdpIndustryBreakdown {
  total: number;
  agriculture_forestry_fishing: number;
  mining_quarrying: number;
  manufacturing: number;
  electricity_water_waste: number;
  construction: number;
  wholesale_retail_trade: number;
  transport_storage: number;
  accommodation_food: number;
  information_communication: number;
  financial_insurance: number;
  real_estate: number;
  professional_services: number;
  public_administration: number;
  education: number;
  health_social_work: number;
  other_services: number;
}

export interface FijiGdpNominalYearFull {
  year: string;
  detail_level: "full_industry_breakdown";
  preliminary: false;
  industries: FijiGdpIndustryBreakdown;
}

export interface FijiGdpNominalYearTotalOnly {
  year: string;
  detail_level: "total_only";
  total: number;
  real_growth_pct: number;
  preliminary: boolean;
  note: string;
}

export type FijiGdpNominalYearData = FijiGdpNominalYearFull | FijiGdpNominalYearTotalOnly;

export interface FijiGdpRealGrowthYearData {
  year: string;
  real_growth_pct: number | null;
  note?: string;
}

export const VALID_MEASURES = ["nominal", "real_growth"] as const;
export type FijiGdpMeasure = (typeof VALID_MEASURES)[number];
export const DEFAULT_MEASURE: FijiGdpMeasure = "nominal";

const NOMINAL_2019: FijiGdpNominalYearFull = {
  year: "2019",
  detail_level: "full_industry_breakdown",
  preliminary: false,
  industries: {
    total: 11547.1,
    agriculture_forestry_fishing: 748.2,
    mining_quarrying: 152.3,
    manufacturing: 894.6,
    electricity_water_waste: 234.1,
    construction: 567.8,
    wholesale_retail_trade: 1823.4,
    transport_storage: 643.2,
    accommodation_food: 892.1,
    information_communication: 421.3,
    financial_insurance: 689.4,
    real_estate: 1243.7,
    professional_services: 456.2,
    public_administration: 978.4,
    education: 543.1,
    health_social_work: 412.3,
    other_services: 847.9,
  },
};

const NOMINAL_BY_YEAR: Record<string, FijiGdpNominalYearData> = {
  "2019": NOMINAL_2019,
  "2020": { year: "2020", detail_level: "total_only", total: 9169.1, real_growth_pct: -17.2, preliminary: false, note: "COVID-19 impact — -17.2% real growth" },
  "2021": { year: "2021", detail_level: "total_only", total: 8611.5, real_growth_pct: -4.3, preliminary: false, note: "-4.3% real growth" },
  "2022": { year: "2022", detail_level: "total_only", total: 10958.3, real_growth_pct: 17.7, preliminary: false, note: "+17.7% real growth — recovery" },
  "2023": { year: "2023", detail_level: "total_only", total: 12323.2, real_growth_pct: 9.4, preliminary: false, note: "+9.4% real growth" },
  "2024": { year: "2024", detail_level: "total_only", total: 13537.5, real_growth_pct: 3.5, preliminary: true, note: "+3.5% real growth [preliminary]" },
};

// 2019 is the new rebase base year — FBoS's release does not publish a
// comparable real growth rate for the base year itself, so this is null
// rather than fabricated (same posture as the file-level doc comment
// above).
const REAL_GROWTH_BY_YEAR: Record<string, number | null> = {
  "2019": null,
  "2020": -17.2,
  "2021": -4.3,
  "2022": 17.7,
  "2023": 9.4,
  "2024": 3.5,
};

export const SUPPORTED_YEARS = Object.keys(NOMINAL_BY_YEAR);

export interface FijiGdpResult {
  nation: "FJ";
  indicator: "Gross Domestic Product by Industry";
  source_institution: "Fiji Bureau of Statistics";
  publication: "FBoS Release No. 62 — GDP Rebase 2019";
  publication_date: "2025-09-03";
  base_year: 2019;
  unit: "FJD Millions";
  measure: FijiGdpMeasure;
  data: FijiGdpNominalYearData | FijiGdpRealGrowthYearData;
  methodology_notes: string;
  attribution: typeof SOURCE_ATTRIBUTION;
  fetched_at: string;
}

const METHODOLOGY_NOTES = "GDP rebased from 2014 to 2019. 2024 data preliminary.";

/**
 * year: required, one of SUPPORTED_YEARS. measure: nominal (default) or
 * real_growth. Mirrors getSamoaGdp()'s async signature for
 * calling-convention consistency with the rest of this directory, even
 * though there is no actual fetch/cache here — this data has no live
 * upstream.
 */
export async function getFijiGdp(year: string, measure: FijiGdpMeasure = DEFAULT_MEASURE): Promise<FijiGdpResult> {
  if (!SUPPORTED_YEARS.includes(year)) {
    throw new Error(`Unsupported year "${year}" — expected one of: ${SUPPORTED_YEARS.join(", ")}`);
  }

  let data: FijiGdpNominalYearData | FijiGdpRealGrowthYearData;
  if (measure === "real_growth") {
    const pct = REAL_GROWTH_BY_YEAR[year] ?? null;
    data =
      pct === null
        ? { year, real_growth_pct: null, note: "2019 is the GDP rebase base year — FBoS does not publish a comparable real growth rate for it." }
        : { year, real_growth_pct: pct };
  } else {
    data = NOMINAL_BY_YEAR[year]!;
  }

  return {
    nation: "FJ",
    indicator: "Gross Domestic Product by Industry",
    source_institution: "Fiji Bureau of Statistics",
    publication: "FBoS Release No. 62 — GDP Rebase 2019",
    publication_date: "2025-09-03",
    base_year: 2019,
    unit: "FJD Millions",
    measure,
    data,
    methodology_notes: METHODOLOGY_NOTES,
    attribution: SOURCE_ATTRIBUTION,
    fetched_at: new Date().toISOString(),
  };
}
