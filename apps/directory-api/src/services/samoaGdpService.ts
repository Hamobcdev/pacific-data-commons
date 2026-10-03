// samoaGdpService.ts
//
// Samoa GDP, expenditure approach — directly transcribed from the Samoa
// Bureau of Statistics' own published report (not a third-party
// aggregation via an intermediary API, unlike samoaCpiService.ts's World
// Bank series). Decision 42 applies here, not Decision 59/60: this is a
// structured queryable endpoint over an openly-accessible government
// report, Tier 1 capped, underlying document never paywalled.
//
// Source: Samoa Bureau of Statistics, "Gross Domestic Product — Expenditure
// Approach" report, FY2025/26, published 1 October 2026. Author: Dan Isara,
// National Accounts & Finance Statistics Division (www.sbs.gov.ws,
// fsd@sbs.gov.ws).
//
// Static data, not a live upstream fetch: SBS publishes this annually, not
// via a queryable API, so there is nothing to poll or cache-invalidate
// here — the two fiscal years below are updated by hand each time SBS
// publishes a new report (same posture as a yearly re-certification, not
// a TTL cache).

export const SOURCE_ATTRIBUTION = {
  source: "Samoa Bureau of Statistics",
  source_document: "Gross Domestic Product — Expenditure Approach, FY2025/26",
  author: "Dan Isara, National Accounts & Finance Statistics Division",
  published: "2026-10-01",
  source_url: "https://www.sbs.gov.ws",
  contact: "fsd@sbs.gov.ws",
  data_quality: "government_source_transcribed" as const,
  license: "Open government data — attribution required",
  disclaimer:
    "This endpoint reproduces figures transcribed directly from Samoa Bureau of Statistics' own published report (Decision 42 — governance/research endpoint, Tier 1 capped, underlying document openly accessible, never paywalled). SBP has transcribed these values but has not independently audited SBS's own methodology or source data — this is not an SBS-certified live feed, and any discrepancy should be checked against the original report at the source_url above.",
};

export interface SamoaGdpFiscalYearComponents {
  fce: {
    total_nominal_sat_mil: number;
    total_real_2013_sat_mil: number | null;
    total_real_growth_pct: number | null;
    households_share_of_fce_pct: number | null;
    households_real_growth_pct: number | null;
    households_nominal_growth_pct: number | null;
    govt_share_of_fce_pct: number | null;
    govt_real_growth_pct: number | null;
    govt_nominal_growth_pct: number | null;
    npish_real_sat_mil: number | null;
    npish_real_growth_pct: number | null;
    npish_nominal_growth_pct: number | null;
  };
  gcf: {
    total_nominal_sat_mil: number;
    total_real_2013_sat_mil: number | null;
    total_real_growth_pct: number | null;
    total_nominal_growth_pct: number | null;
    gfcf_nominal_sat_mil: number | null;
    gfcf_nominal_growth_pct: number | null;
    gfcf_real_growth_pct: number | null;
    construction_real_growth_pct: number | null;
    durable_equipment_real_growth_pct: number | null;
    inventories_sat_mil: number | null;
  };
  external: {
    net_real_2013_sat_mil: number | null;
    net_nominal_sat_mil: number | null;
    exports_real_sat_mil: number | null;
    exports_real_growth_pct: number | null;
    imports_real_sat_mil: number | null;
    imports_real_growth_pct: number | null;
  };
}

export interface SamoaGdpFiscalYear extends SamoaGdpFiscalYearComponents {
  fiscal_year: string;
  gdp_nominal_sat_mil: number;
  gdp_real_2013_sat_mil: number;
  nominal_growth_pct: number | null;
  real_growth_pct: number | null;
}

export interface SamoaGdpResult {
  country: "Samoa";
  country_iso3: "WSM";
  currency: "SAT";
  currency_note: "Figures in SAT millions unless otherwise noted. Real figures are at constant 2013 prices.";
  fiscal_years: SamoaGdpFiscalYear[];
  latest: SamoaGdpFiscalYear;
  fetched_at: string;
  attribution: typeof SOURCE_ATTRIBUTION;
}

const FY_2025_26: SamoaGdpFiscalYear = {
  fiscal_year: "2025/26",
  gdp_nominal_sat_mil: 3619.8,
  gdp_real_2013_sat_mil: 2303.7,
  nominal_growth_pct: -4.7,
  real_growth_pct: -8.1,
  fce: {
    total_nominal_sat_mil: 3326.0,
    total_real_2013_sat_mil: 2328.0,
    total_real_growth_pct: 1.7,
    households_share_of_fce_pct: 76.4,
    households_real_growth_pct: 2.6,
    households_nominal_growth_pct: 5.4,
    govt_share_of_fce_pct: 21.3,
    govt_real_growth_pct: -5.3,
    govt_nominal_growth_pct: -15.5,
    npish_real_sat_mil: 45.2,
    npish_real_growth_pct: 9.6,
    npish_nominal_growth_pct: 11.6,
  },
  gcf: {
    total_nominal_sat_mil: 822.8,
    total_real_2013_sat_mil: 544.4,
    total_real_growth_pct: -33.9,
    total_nominal_growth_pct: -23.6,
    gfcf_nominal_sat_mil: 953.5,
    gfcf_nominal_growth_pct: -7.6,
    gfcf_real_growth_pct: -9.2,
    construction_real_growth_pct: -6.0,
    durable_equipment_real_growth_pct: -12.3,
    inventories_sat_mil: -131.2,
  },
  external: {
    net_real_2013_sat_mil: -568.7,
    net_nominal_sat_mil: -529.0,
    exports_real_sat_mil: 665.9,
    exports_real_growth_pct: 2.3,
    imports_real_sat_mil: 1234.6,
    imports_real_growth_pct: -1.8,
  },
};

// FY2024/25 comparator — SBS's report breaks several sub-components out
// only for the primary fiscal year; fields not published for this prior
// year are null rather than estimated (same "never fabricate a number"
// posture as samoaCpiService.ts).
const FY_2024_25: SamoaGdpFiscalYear = {
  fiscal_year: "2024/25",
  gdp_nominal_sat_mil: 3799.8,
  gdp_real_2013_sat_mil: 2507.3,
  nominal_growth_pct: null,
  real_growth_pct: null,
  fce: {
    total_nominal_sat_mil: 3274.8,
    total_real_2013_sat_mil: 2289.8,
    total_real_growth_pct: null,
    households_share_of_fce_pct: null,
    households_real_growth_pct: null,
    households_nominal_growth_pct: null,
    govt_share_of_fce_pct: null,
    govt_real_growth_pct: null,
    govt_nominal_growth_pct: null,
    npish_real_sat_mil: null,
    npish_real_growth_pct: null,
    npish_nominal_growth_pct: null,
  },
  gcf: {
    total_nominal_sat_mil: 1076.8,
    total_real_2013_sat_mil: 824.1,
    total_real_growth_pct: null,
    total_nominal_growth_pct: null,
    gfcf_nominal_sat_mil: 1031.7,
    gfcf_nominal_growth_pct: null,
    gfcf_real_growth_pct: null,
    construction_real_growth_pct: null,
    durable_equipment_real_growth_pct: null,
    inventories_sat_mil: 44.4,
  },
  external: {
    net_real_2013_sat_mil: -606.7,
    net_nominal_sat_mil: -551.8,
    exports_real_sat_mil: 651.0,
    exports_real_growth_pct: null,
    imports_real_sat_mil: 1257.6,
    imports_real_growth_pct: null,
  },
};

const FISCAL_YEARS_BY_LABEL = new Map<string, SamoaGdpFiscalYear>([
  [FY_2025_26.fiscal_year, FY_2025_26],
  [FY_2024_25.fiscal_year, FY_2024_25],
]);

export const SUPPORTED_FISCAL_YEARS = Array.from(FISCAL_YEARS_BY_LABEL.keys());

/**
 * fiscalYear: optional filter to a single published fiscal year (e.g.
 * "2024/25"). all: when true, returns every published fiscal year instead
 * of just the latest. Mirrors getSamoaCpi()'s async signature for calling-
 * convention consistency with the rest of this directory, even though
 * there is no actual fetch/cache here — this data has no live upstream.
 */
export async function getSamoaGdp(fiscalYear?: string, all = false): Promise<SamoaGdpResult> {
  let fiscalYears: SamoaGdpFiscalYear[];
  if (fiscalYear) {
    const match = FISCAL_YEARS_BY_LABEL.get(fiscalYear);
    if (!match) {
      throw new Error(`Unsupported fiscal_year "${fiscalYear}" — expected one of: ${SUPPORTED_FISCAL_YEARS.join(", ")}`);
    }
    fiscalYears = [match];
  } else {
    fiscalYears = all ? [FY_2025_26, FY_2024_25] : [FY_2025_26];
  }

  return {
    country: "Samoa",
    country_iso3: "WSM",
    currency: "SAT",
    currency_note: "Figures in SAT millions unless otherwise noted. Real figures are at constant 2013 prices.",
    fiscal_years: fiscalYears,
    latest: FY_2025_26,
    fetched_at: new Date().toISOString(),
    attribution: SOURCE_ATTRIBUTION,
  };
}
