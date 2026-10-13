// spcPacificCpiService.ts
//
// SPC Pacific CPI / inflation, sourced from the Pacific Community's SDMX
// data service (stats-nsi-stable.pacificdata.org) — free public API, no
// key required. Decision 59/60: first-party wrapper over an
// already-openly-accessible aggregator API, Tier 1 capped.
//
// Confirmed live 2026-10-13: the unfiltered dataflow URL
// (.../rest/data/SPC,DF_CPI,3.2/) returns 2.8MB — every country,
// commodity and frequency SPC publishes for this dataflow, not usable
// per-request. The dimension-filtered key below narrows it to our 6
// countries, inflation + index indicators, all-items commodity, annual
// frequency — 23KB. Dimension order and codes confirmed live against this
// dataflow's own DSD (GET .../dataflow/SPC/DF_CPI/3.2?references=all),
// not guessed:
//   dimension order: FREQ.GEO_PICT.INDICATOR.COMMODITY
//   FREQ=A (annual); GEO_PICT: FJ/PG/SB/TO/VU/WS; INDICATOR: INF
//   (inflation rate) + IDX (index); COMMODITY=_T (all items)
// Requests `Accept: application/vnd.sdmx.data+json` — SDMX-JSON 2.0, a
// plain object (no XML library available in this Worker); decodeSdmxJson
// below walks its series/observation index structure.
//
// pdqe.sources row: ea027953-2f16-485d-95f0-4d750d7a2fae (SPC Pacific CPI
// Inflation), registered 2026-10-13.

const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — annual data

const SPC_URL = "https://stats-nsi-stable.pacificdata.org/rest/data/SPC,DF_CPI,3.2/A.FJ+PG+SB+TO+VU+WS.INF+IDX._T";

const COUNTRY_NAMES: Record<string, string> = {
  FJ: "Fiji",
  PG: "Papua New Guinea",
  SB: "Solomon Islands",
  TO: "Tonga",
  VU: "Vanuatu",
  WS: "Samoa",
};

const INDICATOR_NAMES: Record<string, "inflation_rate_pct" | "cpi_index"> = {
  INF: "inflation_rate_pct",
  IDX: "cpi_index",
};

export const SOURCE_ATTRIBUTION = {
  source: "Pacific Community (SPC) — SDMX data service",
  source_url: SPC_URL,
  original_source: "National statistics offices of each listed country, as compiled by SPC",
  data_quality: "third_party_aggregated" as const,
  disclaimer:
    "This endpoint serves SPC's own published CPI/inflation series via PDC's structured queryable layer. SPC compiles this from each country's national statistics office; SBP has not independently confirmed these figures. Do not present this as a primary-source or government-certified statistic.",
};

// -- SDMX-JSON 2.0 response shape (minimal subset actually used) --
interface SdmxDimensionValue {
  id: string;
}
interface SdmxDimension {
  id: string;
  values: SdmxDimensionValue[];
}
interface SdmxStructure {
  dimensions: { series: SdmxDimension[]; observation: SdmxDimension[] };
}
interface SdmxSeries {
  observations: Record<string, [number | null, ...unknown[]]>;
}
interface SdmxDataSet {
  series: Record<string, SdmxSeries>;
}
interface SdmxResponse {
  data: { dataSets: SdmxDataSet[]; structures: SdmxStructure[] };
}

export interface CpiObservation {
  country_iso2: string;
  country_name: string;
  year: number;
  indicator: "inflation_rate_pct" | "cpi_index";
  value: number | null;
}

export interface CpiResult {
  countries: string[];
  observations: CpiObservation[];
  fetched_at: string;
  attribution: typeof SOURCE_ATTRIBUTION;
}

let cache: { data: CpiResult; expires: number } | null = null;

/**
 * Decodes an SDMX-JSON 2.0 data message. Series are keyed by a
 * colon-joined tuple of dimension-value indices (e.g. "0:2:1:0") in the
 * exact order structure.dimensions.series lists them — this dataflow's
 * order is FREQ.GEO_PICT.INDICATOR.COMMODITY. Observations within a
 * series are keyed by index into structure.dimensions.observation's
 * TIME_PERIOD values. Each observation's value is array index 0; any
 * further elements are attributes (OBS_STATUS, OBS_COMMENT) — not
 * currently surfaced.
 */
function decodeSdmxJson(body: SdmxResponse): CpiObservation[] {
  const structure = body.data.structures[0];
  const dataSet = body.data.dataSets[0];
  if (!structure || !dataSet) return [];

  const seriesDims = structure.dimensions.series;
  const timeValues = structure.dimensions.observation.find((d) => d.id === "TIME_PERIOD")?.values ?? [];
  const geoIdx = seriesDims.findIndex((d) => d.id === "GEO_PICT");
  const indicatorIdx = seriesDims.findIndex((d) => d.id === "INDICATOR");
  if (geoIdx === -1 || indicatorIdx === -1) return [];

  const observations: CpiObservation[] = [];
  for (const [seriesKey, series] of Object.entries(dataSet.series)) {
    const indices = seriesKey.split(":").map(Number);
    const geoCode = seriesDims[geoIdx]?.values[indices[geoIdx]!]?.id;
    const indicatorCode = seriesDims[indicatorIdx]?.values[indices[indicatorIdx]!]?.id;
    const indicatorName = indicatorCode ? INDICATOR_NAMES[indicatorCode] : undefined;
    if (!geoCode || !indicatorName) continue; // defensive — only INF/IDX were requested

    for (const [obsKey, obsValue] of Object.entries(series.observations)) {
      const timePeriod = timeValues[Number(obsKey)]?.id;
      if (!timePeriod) continue;
      observations.push({
        country_iso2: geoCode,
        country_name: COUNTRY_NAMES[geoCode] ?? geoCode,
        year: Number(timePeriod),
        indicator: indicatorName,
        value: obsValue[0],
      });
    }
  }
  return observations.sort((a, b) => a.country_name.localeCompare(b.country_name) || b.year - a.year);
}

async function fetchFreshCpi(): Promise<CpiResult> {
  const response = await fetch(SPC_URL, {
    headers: { Accept: "application/vnd.sdmx.data+json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`SPC SDMX API (CPI) returned HTTP ${response.status}`);
  }
  const body = (await response.json()) as SdmxResponse;
  const observations = decodeSdmxJson(body);
  if (observations.length === 0) {
    throw new Error("SPC SDMX API (CPI) returned no observations for the Pacific country set");
  }

  return {
    countries: Object.values(COUNTRY_NAMES),
    observations,
    fetched_at: new Date().toISOString(),
    attribution: SOURCE_ATTRIBUTION,
  };
}

export async function getPacificCpi(): Promise<CpiResult> {
  if (!cache || Date.now() >= cache.expires) {
    try {
      const fresh = await fetchFreshCpi();
      cache = { data: fresh, expires: Date.now() + CACHE_TTL_MS };
    } catch (err) {
      if (cache) {
        return cache.data;
      }
      throw err;
    }
  }
  return cache.data;
}

/** Test-only: clears the in-memory cache between test cases. */
export function __resetPacificCpiCacheForTests(): void {
  cache = null;
}
