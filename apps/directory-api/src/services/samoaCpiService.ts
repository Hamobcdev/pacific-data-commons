// samoaCpiService.ts
//
// Samoa Consumer Price Index, sourced from World Bank Open Data's free
// public API — no API key required. World Bank itself attributes this
// series to Samoa Bureau of Statistics (SBS); PDC is not SBS, has no
// relationship with SBS confirming this data, and must not present this
// endpoint as if SBS or the Samoa government certified it directly (see
// this file's SOURCE_ATTRIBUTION below, surfaced verbatim in every
// response — this matters ahead of SBP approaching SBS directly).
//
// Indicators:
//   FP.CPI.TOTL    — Consumer price index (2010 = 100), level
//   FP.CPI.TOTL.ZG — Inflation, consumer prices (annual %)
//
// Caching: annual data, updated at most once a year upstream (World Bank's
// own response already carries `cache-control: public, max-age=86400` and
// `lastupdated` — confirmed live). A long in-memory TTL (24h) is more than
// sufficient — same pattern as fxRateService.ts's cache, just a much longer
// window matching this data's real update cadence rather than fx's daily
// one. Never throws: an upstream outage returns the last good cached value
// if one exists, otherwise propagates the error to the route (no synthetic
// fallback numbers for real economic data — unlike fxRateService's static
// fallback rates, a wrong CPI figure is not an acceptable degradation).

const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const WORLD_BANK_BASE = "https://api.worldbank.org/v2/country/WSM/indicator";
const LEVEL_INDICATOR = "FP.CPI.TOTL";
const INFLATION_INDICATOR = "FP.CPI.TOTL.ZG";

export const SOURCE_ATTRIBUTION = {
  source: "World Bank Open Data",
  source_url: `https://api.worldbank.org/v2/country/WSM/indicator/${LEVEL_INDICATOR}`,
  original_source: "Samoa Bureau of Statistics (as attributed by World Bank's own indicator metadata)",
  data_quality: "third_party_aggregated" as const,
  disclaimer:
    "This endpoint serves World Bank Open Data's own published Samoa CPI series via PDC's structured queryable layer. World Bank attributes the underlying figures to Samoa Bureau of Statistics, but this is not an SBS-certified or Samoa-government-certified data feed — SBP has not confirmed this data with SBS directly. Do not present this as a primary-source or government-certified statistic.",
  // Not required for function — documents intent for future reference
  // (routeSchemas.ts's PDC_PILOT_EARNINGS_WALLET doc comment has the wallet
  // rationale; this is the same note surfaced in the response itself).
  revenue_tracking_note:
    "Payments for this endpoint settle to a dedicated wallet tracked separately from SBP's main directory revenue, as part of an institutional/MVP earnings pilot for first-party open-data endpoints (Decision 59/60).",
};

interface WorldBankObservation {
  date: string;
  value: number | null;
  unit?: string;
  decimal?: number;
}

interface WorldBankResponse {
  0: { lastupdated?: string };
  1: WorldBankObservation[] | null;
}

async function fetchIndicator(indicatorId: string, mostRecentNonEmpty: number): Promise<{ observations: WorldBankObservation[]; lastUpdated: string | null }> {
  const url = `${WORLD_BANK_BASE}/${indicatorId}?format=json&mrnev=${mostRecentNonEmpty}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`World Bank API ${indicatorId} returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as WorldBankResponse;
  const observations = data[1] ?? [];
  if (observations.length === 0) {
    throw new Error(`World Bank API ${indicatorId} returned no observations for Samoa (WSM)`);
  }
  return { observations, lastUpdated: data[0]?.lastupdated ?? null };
}

export interface SamoaCpiObservation {
  year: number;
  cpi_index: number | null;
  inflation_pct: number | null;
}

export interface SamoaCpiResult {
  country: "Samoa";
  country_iso3: "WSM";
  indicator_base_year: 2010;
  observations: SamoaCpiObservation[];
  latest: SamoaCpiObservation | null;
  world_bank_last_updated: string | null;
  fetched_at: string;
  attribution: typeof SOURCE_ATTRIBUTION;
}

let cache: { data: SamoaCpiResult; expires: number } | null = null;

async function fetchFreshCpi(years: number): Promise<SamoaCpiResult> {
  const [levelResult, inflationResult] = await Promise.all([fetchIndicator(LEVEL_INDICATOR, years), fetchIndicator(INFLATION_INDICATOR, years)]);

  const byYear = new Map<number, SamoaCpiObservation>();
  for (const obs of levelResult.observations) {
    const year = Number(obs.date);
    byYear.set(year, { year, cpi_index: obs.value, inflation_pct: null });
  }
  for (const obs of inflationResult.observations) {
    const year = Number(obs.date);
    const existing = byYear.get(year);
    if (existing) {
      existing.inflation_pct = obs.value;
    } else {
      byYear.set(year, { year, cpi_index: null, inflation_pct: obs.value });
    }
  }

  const observations = Array.from(byYear.values()).sort((a, b) => b.year - a.year);
  const latest = observations.find((o) => o.cpi_index !== null) ?? observations[0] ?? null;

  return {
    country: "Samoa",
    country_iso3: "WSM",
    indicator_base_year: 2010,
    observations,
    latest,
    world_bank_last_updated: levelResult.lastUpdated,
    fetched_at: new Date().toISOString(),
    attribution: SOURCE_ATTRIBUTION,
  };
}

/** years: how many most-recent non-empty observations to return (World Bank's own mrnev param). Default 15 — enough for a useful trend without an unbounded payload. */
export async function getSamoaCpi(years = 15): Promise<SamoaCpiResult> {
  if (!cache || Date.now() >= cache.expires) {
    try {
      const fresh = await fetchFreshCpi(years);
      cache = { data: fresh, expires: Date.now() + CACHE_TTL_MS };
    } catch (err) {
      if (cache) {
        // Serve the last known-good value past its TTL rather than fail a
        // paid query outright on a transient World Bank outage.
        return cache.data;
      }
      throw err;
    }
  }
  return cache.data;
}

/** Test-only: clears the in-memory cache between test cases. */
export function __resetSamoaCpiCacheForTests(): void {
  cache = null;
}
