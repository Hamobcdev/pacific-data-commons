// pacificCoralBleachingService.ts
//
// Daily coral bleaching alert levels (0-4) and degree heating weeks (DHW)
// for a Pacific reef region, sourced from NOAA Coral Reef Watch's
// CoralTemp 5km daily satellite product — no API key required.
//
// IMPORTANT — this service is built against ERDDAP, not the THREDDS
// endpoint the build brief named first, and uses .csv rather than the
// .ascii fileType the brief's own ERDDAP fallback URL specified. Both
// deviations are evidence-based, confirmed live during this session
// before writing any code (the build brief's own instruction: "If that
// THREDDS endpoint is unavailable, fallback to ERDDAP"):
//
//   - THREDDS (pae-paha.pacioos.hawaii.edu/thredds/dodsC/dhw_5km):
//     variables confirmed present via .dds (CRW_BAA, CRW_DHW, CRW_SST,
//     etc. all exist, matching the brief). But live testing found it
//     genuinely unreliable — repeated ~30s timeouts on simple index-slice
//     requests that should be fast — and when it did respond, a
//     time-index slice I expected to be near the array's end ([1085:1089]
//     of a 1090-length dimension) decoded to mid-2015 dates, wildly
//     inconsistent with this dataset's "latest 3 years" framing and with
//     its own NC_GLOBAL time_coverage_start. That's consistent with a
//     known THREDDS NcML aggregation pitfall for continuously-updated
//     "best"/"latest" datasets: the index-to-granule mapping can shift
//     between a dimension-size read and a data read if the aggregation
//     rescans in between. Index-based time lookups against this specific
//     endpoint are not trustworthy enough for a paid data-integrity-
//     sensitive endpoint.
//   - ERDDAP (coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW): the
//     exact dataset+variables the brief's fallback URL named. Its own
//     .das confirms a real, sensible time actual_range ending
//     2026-10-02T12:00:00Z (consistent with "today"). But requesting
//     fileType=.ascii on this specific dataset returns a live HTTP 400
//     ("fileType=.ascii isn't supported by this dataset"). fileType=.csv
//     on the identical query works cleanly and fast (~5s), including the
//     `(last)` time convenience keyword and multi-variable
//     (CRW_BAA,CRW_DHW) requests in one call. This service uses .csv.
//
// Given ERDDAP proved reliable, fast, and verifiably correct on every
// live check, and THREDDS proved both slow/unreliable AND gave a
// concretely wrong-looking result when it did respond, this service
// talks to ERDDAP only — not a THREDDS-first-then-ERDDAP-fallback chain.
// Implementing a "try THREDDS first" path that's already been observed
// to hang for ~30s before failing (or worse, succeed with untrustworthy
// data) would make every real request slower and riskier for no
// corresponding benefit. If THREDDS's reliability changes, revisit this.
//
// Grid cells NOAA has no reading for (land, or genuinely missing) come
// back from ERDDAP's CSV as the literal text "NaN" for both CRW_BAA and
// CRW_DHW — confirmed live with a request centred tightly on Apia itself
// (radius_deg 0.1), where the cell nearest the coastline came back
// "NaN,NaN" while every surrounding ocean cell had real values. Never
// treated as a measured zero: excluded from every aggregate below, and
// bleaching_alert_level/max_alert_in_region/mean_dhw are only ever
// computed from cells NOAA actually reported.
//
// Caching: 24-hour in-memory TTL (task-specified), keyed by the exact
// requested lat/lon/radius (this endpoint's query is meaningfully
// parameterised, unlike pacificOceanForecastService's fixed single
// query) — same Map-keyed-by-params pattern as
// pacificFisheriesPurseSeineService's species+year cache.
//
// Never throws on a third-party fetch/parse failure, or when the
// requested region has zero cells NOAA reported data for (confirmed
// live: happens right at a coastline) — the route layer turns a null
// into a 502, per this task's explicit instruction.

const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const ERDDAP_CORAL_BASE = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/NOAA_DHW";

export const DEFAULT_LAT = -13.759; // Samoa centre
export const DEFAULT_LON = -172.104;
export const DEFAULT_RADIUS_DEG = 2.0;

export const SOURCE_ATTRIBUTION = "NOAA Coral Reef Watch CoralTemp 5km Daily Satellite Monitoring";
export const SOURCE_ATTRIBUTION_URL = "https://coralreefwatch.noaa.gov/";
export const REPORTING_LAG_NOTE = "NOAA CoralTemp updates daily with ~24h processing lag";

const ALERT_LABELS = ["No Stress", "Watch", "Warning", "Alert Level 1", "Alert Level 2"] as const;
type AlertLevel = 0 | 1 | 2 | 3 | 4;

export interface CoralBleachingResult {
  centre_lat: number;
  centre_lon: number;
  radius_deg: number;
  bleaching_alert_level: AlertLevel;
  bleaching_alert_label: (typeof ALERT_LABELS)[number];
  max_alert_in_region: AlertLevel;
  mean_dhw: number;
  observation_date: string;
  data_currency: "daily";
  reporting_lag_note: string;
  attribution: string;
  attribution_url: string;
  region_sample_size: number;
  cached_at: string;
}

interface CoralRow {
  time: string;
  lat: number;
  lon: number;
  baa: number;
  dhw: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function buildErddapUrl(latMin: number, latMax: number, lonMin: number, lonMax: number): string {
  const spatialTimeConstraint = `%5B(last)%5D%5B(${latMin}):(${latMax})%5D%5B(${lonMin}):(${lonMax})%5D`;
  return `${ERDDAP_CORAL_BASE}.csv?CRW_BAA${spatialTimeConstraint},CRW_DHW${spatialTimeConstraint}`;
}

/** ERDDAP .csv griddap response: a column-name row, a units row, then one data row per cell — "time,latitude,longitude,CRW_BAA,CRW_DHW". Missing/land cells render as literal "NaN" text. */
function parseCoralCsv(csv: string): CoralRow[] {
  const lines = csv.trim().split("\n");
  const rows: CoralRow[] = [];
  for (let i = 2; i < lines.length; i++) {
    const parts = lines[i]!.split(",");
    if (parts.length < 5) continue;
    rows.push({
      time: parts[0]!,
      lat: Number(parts[1]),
      lon: Number(parts[2]),
      baa: Number(parts[3]),
      dhw: Number(parts[4]),
    });
  }
  return rows;
}

/** Nearest cell to the requested centre point that NOAA actually reported a BAA value for — not necessarily the geometrically nearest cell overall, since that one may be NaN (land/missing), confirmed live right at a coastline. */
function findNearestValidRow(rows: CoralRow[], lat: number, lon: number): CoralRow | null {
  let best: CoralRow | null = null;
  let bestDistSq = Infinity;
  for (const row of rows) {
    if (!Number.isFinite(row.baa)) continue;
    const distSq = (row.lat - lat) ** 2 + (row.lon - lon) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = row;
    }
  }
  return best;
}

function maxValidBaa(rows: CoralRow[]): number | null {
  let max = -Infinity;
  for (const row of rows) {
    if (Number.isFinite(row.baa) && row.baa > max) max = row.baa;
  }
  return max === -Infinity ? null : max;
}

function meanValidDhw(rows: CoralRow[]): number | null {
  let sum = 0;
  let count = 0;
  for (const row of rows) {
    if (Number.isFinite(row.dhw)) {
      sum += row.dhw;
      count++;
    }
  }
  return count === 0 ? null : sum / count;
}

const cache = new Map<string, { data: CoralBleachingResult; expires: number }>();

/**
 * Coral bleaching alert level and DHW for a region centred on (lat, lon).
 * Returns null (never throws) on any upstream failure, or when NOAA
 * reported zero valid (non-missing) cells anywhere in the requested
 * region — the route layer turns that into a 502.
 */
export async function getCoralBleaching(lat: number, lon: number, radiusDeg: number): Promise<CoralBleachingResult | null> {
  const cacheKey = `${lat}:${lon}:${radiusDeg}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expires) return cached.data;

  const latMin = clamp(lat - radiusDeg, -90, 90);
  const latMax = clamp(lat + radiusDeg, -90, 90);
  const lonMin = clamp(lon - radiusDeg, -180, 180);
  const lonMax = clamp(lon + radiusDeg, -180, 180);

  let rows: CoralRow[];
  try {
    const response = await fetch(buildErddapUrl(latMin, latMax, lonMin, lonMax), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    rows = parseCoralCsv(await response.text());
  } catch {
    return null;
  }
  if (rows.length === 0) return null;

  const validBaaCount = rows.filter((r) => Number.isFinite(r.baa)).length;
  if (validBaaCount === 0) return null; // entire requested region is land/missing — nothing to report

  const nearest = findNearestValidRow(rows, lat, lon);
  const maxAlert = maxValidBaa(rows);
  const meanDhw = meanValidDhw(rows);
  if (!nearest || maxAlert === null || meanDhw === null) return null;

  const result: CoralBleachingResult = {
    centre_lat: lat,
    centre_lon: lon,
    radius_deg: radiusDeg,
    bleaching_alert_level: nearest.baa as AlertLevel,
    bleaching_alert_label: ALERT_LABELS[nearest.baa]!,
    max_alert_in_region: maxAlert as AlertLevel,
    mean_dhw: Math.round(meanDhw * 100) / 100,
    observation_date: nearest.time.split("T")[0]!,
    data_currency: "daily",
    reporting_lag_note: REPORTING_LAG_NOTE,
    attribution: SOURCE_ATTRIBUTION,
    attribution_url: SOURCE_ATTRIBUTION_URL,
    region_sample_size: validBaaCount,
    cached_at: new Date().toISOString(),
  };

  cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL_MS });
  return result;
}

/** Test-only: clears the in-memory cache between test cases. */
export function __resetCoralBleachingCacheForTests(): void {
  cache.clear();
}
