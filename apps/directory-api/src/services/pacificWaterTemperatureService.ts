// pacificWaterTemperatureService.ts
//
// Live water temperature at two Pacific NOAA CO-OPS tide stations, sourced
// from NOAA's free public Tides & Currents Data Getter API — no API key
// required, confirmed live during this session (a plain unauthed request
// against both stations returned 200 with real recent readings).
//
// Replaces an earlier attempt to source this from the Pacific Data Hub
// CKAN API (pacificdata.org): confirmed live during this session that its
// API puts every request carrying a query string — package_search,
// package_show, datastore_search, even organization_list?all_fields=true —
// behind a Cloudflare managed JS challenge (403 "Just a moment"), while
// bare no-query-string calls (status_show, package_list) succeed. That
// challenge can't be solved by a server-side fetch (no JS engine), so it
// would 403 identically in production. NOAA CO-OPS has no such gate.
//
// Stations (both NOAA PORTS/tide stations in the Pacific, not Pacific
// Island sovereign-nation stations — NOAA doesn't operate stations in most
// Pacific SIDS):
//   1770000 — Pago Pago, American Samoa (closest NOAA station to independent
//             Samoa)
//   1617760 — Honolulu, Hawaii (Pacific reference station)
//
// Caching: NOAA's own "date=recent" window updates roughly every 6 minutes
// upstream. A 30-minute in-memory TTL per station is short enough that the
// data stays meaningfully fresh for a paid live-conditions query, but still
// cuts a large fraction of repeat calls — shorter than
// pacificOceanClimateService's 3-hour TTL because that's blended model
// output (multi-hour update cadence); this is a live instrument reading.
//
// Never throws: any failure (network, timeout, malformed response, NOAA's
// own in-band {"error":...} JSON for a bad station) degrades to null, same
// posture as pacificOceanClimateService.ts and pacificWeatherService.ts —
// the route layer turns a null into a 503 (third-party outage), not a 500.
//
// P10 / Decision 59 posture: this endpoint reports NOAA's own published
// instrument reading as structured data only. It makes no safety,
// navigation, or fisheries-stock judgement of any kind. NOAA CO-OPS is the
// primary source here (not a re-attributed third-party aggregation like
// samoaCpiService's World Bank/SBS case), so SOURCE_ATTRIBUTION doesn't need
// samoaCpiService's "not certified by the original attributed agency"
// caveat — it does still disclose the station is a US federal station, not
// a Pacific Island national authority's own instrument.

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const NOAA_DATAGETTER_URL = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

interface StationInfo {
  name: string;
  nation: string;
}

// Only these two stations are served — not a general NOAA station proxy.
// Keeps this endpoint scoped to what was actually verified live.
const STATIONS: Record<string, StationInfo> = {
  "1770000": { name: "Pago Pago, American Samoa", nation: "American Samoa" },
  "1617760": { name: "Honolulu, Hawaii", nation: "United States (Hawaii) — Pacific reference station" },
};

export const DEFAULT_STATION = "1770000";

export function isValidStation(station: string): boolean {
  return station in STATIONS;
}

export const VALID_STATIONS = Object.keys(STATIONS);

export const SOURCE_ATTRIBUTION = "NOAA CO-OPS / National Ocean Service — tidesandcurrents.noaa.gov";

export interface PacificWaterTemperature {
  nation: string;
  indicator: "sea_water_temperature";
  value: number;
  unit: "celsius";
  period: string;
  source: string;
  attribution: string;
  station_id: string;
  station_name: string;
  queried_at: string;
}

/** Just enough of NOAA CO-OPS Data Getter's response shape to read — untrusted third-party HTTP JSON, same posture as this codebase's other upstream response interfaces. */
interface NoaaDataGetterResponse {
  error?: { message?: string };
  metadata?: { id?: string; name?: string };
  data?: Array<{ t?: string; v?: string; f?: string }>;
}

function toIsoPeriod(noaaTimestamp: string): string {
  // NOAA returns "YYYY-MM-DD HH:MM" in GMT (time_zone=gmt is always passed).
  return `${noaaTimestamp.replace(" ", "T")}:00Z`;
}

async function fetchFreshWaterTemperature(stationId: string, info: StationInfo): Promise<PacificWaterTemperature | null> {
  const url =
    `${NOAA_DATAGETTER_URL}?station=${encodeURIComponent(stationId)}` +
    "&product=water_temperature&date=recent&units=metric&time_zone=gmt&format=json";

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;

    const body = (await response.json()) as NoaaDataGetterResponse;
    if (body.error) return null;

    const readings = body.data ?? [];
    const latest = readings[readings.length - 1];
    if (!latest?.t || latest.v === undefined) return null;

    const value = Number(latest.v);
    if (!Number.isFinite(value)) return null;

    return {
      nation: info.nation,
      indicator: "sea_water_temperature",
      value,
      unit: "celsius",
      period: toIsoPeriod(latest.t),
      source: "NOAA Center for Operational Oceanographic Products and Services (CO-OPS)",
      attribution: SOURCE_ATTRIBUTION,
      station_id: stationId,
      station_name: body.metadata?.name ?? info.name,
      queried_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

const cache = new Map<string, { data: PacificWaterTemperature; expires: number }>();

/**
 * Current water temperature at one of two NOAA CO-OPS Pacific stations.
 * Returns null (never throws) for an unknown station id or any upstream
 * failure — the route layer turns a valid station's null into a 503
 * (live NOAA failure), same as getPacificOceanClimate.
 */
export async function getPacificWaterTemperature(stationId: string): Promise<PacificWaterTemperature | null> {
  const info = STATIONS[stationId];
  if (!info) return null;

  const cached = cache.get(stationId);
  if (cached && Date.now() < cached.expires) return cached.data;

  const result = await fetchFreshWaterTemperature(stationId, info);
  if (result) {
    cache.set(stationId, { data: result, expires: Date.now() + CACHE_TTL_MS });
  }
  return result;
}

/** Test-only: clears the in-memory cache between test cases. */
export function __resetWaterTemperatureCacheForTests(): void {
  cache.clear();
}
