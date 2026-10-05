// fijiCpiService.ts
//
// Fiji Consumer Price Index — transcribed directly from the Fiji Bureau of
// Statistics' own monthly CPI press releases (not a third-party
// aggregation via an intermediary API). Decision 42 applies here, not
// Decision 59/60: this is a structured queryable endpoint over an openly-
// accessible government report, Tier 1 capped, underlying document never
// paywalled. Same posture as fijiGdpService.ts.
//
// Source: Fiji Bureau of Statistics monthly CPI releases
// (www.statsfiji.gov.fj/statistics/economic-statistics/prices/).
//
// Static data, not a live upstream fetch: FBoS publishes CPI release-by-
// release (a web page per month, not a queryable API or bulk download),
// so there is nothing to poll or cache-invalidate here — figures are added
// by hand as FBoS publishes new releases, same posture as
// fijiGdpService.ts. World Bank Open Data (used by samoaCpiService.ts) was
// considered first for consistency with that endpoint, but this task's own
// brief names FBoS specifically as the source, and FBoS's own releases are
// the more current and more precisely attributed primary source anyway.
//
// Only 3 months are included (July, August, September 2026) — each
// transcribed from that month's own FBoS release page, which also restates
// the prior month's index value for context. June 2026's value (119.5) is
// visible only as a figure restated inside July's release, not from June's
// own release page, so it is surfaced in METHODOLOGY_NOTES as context only,
// not as a queryable observation with its own year-on-year/annual-average
// figures that would have to be fabricated (same "never invent a number"
// posture as fijiGdpService.ts's null real_growth_pct for 2019).
//
// FBoS's own releases do not state an explicit CPI base year — weights are
// derived from the 2019/2020 Household Income and Expenditure Survey
// (HIES), which is not the same thing as an index base year/period. Rather
// than fabricate a base year, base_year is null with weights_basis
// documenting what FBoS does state.

export const SOURCE_ATTRIBUTION = {
  source: "Fiji Bureau of Statistics",
  source_url: "https://www.statsfiji.gov.fj/statistics/economic-statistics/prices/",
  data_quality: "government_source_transcribed" as const,
  license: "Open government data — attribution required",
  disclaimer:
    "This endpoint reproduces figures transcribed directly from the Fiji Bureau of Statistics' own monthly CPI press releases (Decision 42 — governance/research endpoint, Tier 1 capped, underlying releases openly accessible, never paywalled). SBP has transcribed these values but has not independently audited FBoS's own methodology or source data — this is not an FBoS-certified live feed, and any discrepancy should be checked against the original releases at the source_url above.",
};

export interface FijiCpiObservation {
  nation: "FJ";
  indicator: "Consumer Price Index";
  period: string; // YYYY-MM
  value: number; // all-items CPI index
  unit: "index";
  base_year: null;
  weights_basis: "2019/2020 Household Income and Expenditure Survey (HIES)";
  month_over_month_pct: number;
  year_over_year_pct: number;
  annual_average_pct: number;
  source_institution: "Fiji Bureau of Statistics";
  publication_date: string; // ISO date
  release_title: string;
}

// Transcribed directly from each month's own FBoS release page — see this
// file's header comment for sourcing detail and why only these 3 months.
const OBSERVATIONS: FijiCpiObservation[] = [
  {
    nation: "FJ",
    indicator: "Consumer Price Index",
    period: "2026-07",
    value: 118.2,
    unit: "index",
    base_year: null,
    weights_basis: "2019/2020 Household Income and Expenditure Survey (HIES)",
    month_over_month_pct: -1.1,
    year_over_year_pct: 5.7,
    annual_average_pct: 0.2,
    source_institution: "Fiji Bureau of Statistics",
    publication_date: "2026-08-02",
    release_title: "Consumer Price Index – July 2026",
  },
  {
    nation: "FJ",
    indicator: "Consumer Price Index",
    period: "2026-08",
    value: 118.1,
    unit: "index",
    base_year: null,
    weights_basis: "2019/2020 Household Income and Expenditure Survey (HIES)",
    month_over_month_pct: -0.1,
    year_over_year_pct: 7.6,
    annual_average_pct: 1.0,
    source_institution: "Fiji Bureau of Statistics",
    publication_date: "2026-08-31",
    release_title: "Consumer Price Index – August 2026",
  },
  {
    nation: "FJ",
    indicator: "Consumer Price Index",
    period: "2026-09",
    value: 117.6,
    unit: "index",
    base_year: null,
    weights_basis: "2019/2020 Household Income and Expenditure Survey (HIES)",
    month_over_month_pct: -0.4,
    year_over_year_pct: 6.8,
    annual_average_pct: 1.9,
    source_institution: "Fiji Bureau of Statistics",
    publication_date: "2026-10-01",
    release_title: "Consumer Price Index – September 2026",
  },
];

export const METHODOLOGY_NOTES =
  "CPI weights derived from the 2019/2020 Household Income and Expenditure Survey (HIES); price collections occur in 8 urban areas representing nationwide price changes. June 2026's index value (119.5) is referenced in FBoS's July 2026 release as context for July's month-over-month change but is not itself a published observation here — only months with their own FBoS release page are included.";

export interface FijiCpiResult {
  observations: FijiCpiObservation[];
  latest: FijiCpiObservation | null;
  methodology_notes: string;
  attribution: typeof SOURCE_ATTRIBUTION;
  fetched_at: string;
}

export interface FijiCpiFilters {
  year?: number;
  from?: string; // YYYY-MM
  to?: string; // YYYY-MM
}

/** No live upstream (see file header) — async for calling-convention consistency with the rest of this directory, same as getFijiGdp(). */
export async function getFijiCpi(filters: FijiCpiFilters = {}): Promise<FijiCpiResult> {
  let observations = OBSERVATIONS;

  if (filters.year !== undefined) {
    const yearStr = String(filters.year);
    observations = observations.filter((o) => o.period.startsWith(yearStr));
  }
  if (filters.from) {
    observations = observations.filter((o) => o.period >= filters.from!);
  }
  if (filters.to) {
    observations = observations.filter((o) => o.period <= filters.to!);
  }

  observations = [...observations].sort((a, b) => b.period.localeCompare(a.period));

  return {
    observations,
    latest: observations[0] ?? null,
    methodology_notes: METHODOLOGY_NOTES,
    attribution: SOURCE_ATTRIBUTION,
    fetched_at: new Date().toISOString(),
  };
}
