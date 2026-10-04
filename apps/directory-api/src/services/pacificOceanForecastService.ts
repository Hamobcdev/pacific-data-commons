// pacificOceanForecastService.ts
//
// Daily Pacific Ocean surface forecast from the HYCOM GLBy0.08 Global
// Ocean Model, sourced via Pacific Data Hub's THREDDS/OPeNDAP server — no
// API key required, confirmed live during this session.
//
// IMPORTANT — two things in the original build brief didn't match the
// real dataset, confirmed live against the THREDDS .dds/.das for today's
// file before writing this service:
//
//   - There is NO salinity variable anywhere in this product. Confirmed
//     both via the file's own .dds (only surf_el, water_temp, water_u,
//     water_v exist) and via the PCCOS/HYCOM catalog directory listing
//     (only the daily "best" .nc files and the pointer .txt — no separate
//     salinity file). salinity_psu is therefore NOT in this service's
//     response — omitted, not fabricated, same posture as dropping
//     Albacore from the purse-seine endpoint.
//   - The requested bounding box (lat -25..25, lon 150..220) at this
//     file's native grid resolution (0.04° lat, 0.08° lon, both confirmed
//     live) is ~1.09 million grid cells per variable — fetching
//     water_temp + water_u + water_v + surf_el at native resolution would
//     mean ~20MB+ of OPeNDAP ASCII and ~3-4 million parsed values per
//     request, a different order of magnitude from this codebase's other
//     THREDDS-backed endpoints and a real timeout/CPU-budget risk on a
//     Workers-hosted paid endpoint. Confirmed and resolved with the
//     requester before building: REGION_STRIDE below subsamples every
//     10th grid point in each dimension (~11,000 cells/variable — the
//     same order of magnitude as this codebase's other first-party
//     endpoints) when computing each regional mean. This is a genuine
//     spatial sample, not an exhaustive area average — region_sample_size
//     in the response says exactly how many cells contributed to each
//     mean, the same transparency posture as record_count elsewhere in
//     this codebase.
//
// sea_surface_elevation_m (from surf_el) was added to the response beyond
// the original brief, at the requester's explicit follow-up — it's real,
// available data (confirmed in the .dds) and genuinely useful surge
// context for maritime agents alongside temperature and current.
//
// PCCOS's own processing (confirmed via this file's NC_GLOBAL "history"
// attribute, which records the exact `ncks -d lon,129.,240. -d lat,-32.,25.`
// clip used to build it) has ALREADY regionally clipped this file from
// the true HYCOM global grid down to roughly lon 129–240°E, lat -32–25°N
// — the requested Pacific Island bounding box sits comfortably inside
// that, so this service never needs to touch a true global-extent file.
//
// Dataset access pattern (verified live):
//   1. GET HYCOM_POINTER_URL — plain text, today's file date as YYYYMMDD
//      (e.g. "20261004"). This literal URL (with "YYYYMMDD" as a fixed
//      path segment) is what the pointer resource actually lives at —
//      not a template to substitute into.
//   2. The file itself is at `${HYCOM_THREDDS_BASE}${dateStr}.nc`.
//
// Time reference caveat (a real, confirmed-live metadata quirk, not a
// guess): the file's `time`/`time_run` CF `units` attribute ("hours since
// 2026-09-25 12:00:00.000 UTC" on today's file) is internally
// inconsistent with the same file's own NC_GLOBAL `time_origin`
// ("2026-10-02 12:00:00") and `created_on` ("2026-10-03...") — none of
// which match the file's own "best_20261004" pointer-confirmed date.
// This is stale/unregenerated FMRC aggregation metadata, not a reliable
// absolute origin. This service never parses that units string for an
// absolute date: forecast_reference_date comes only from the external,
// explicit, trustworthy pointer file; valid_time is computed by adding
// the live-fetched `time[0]` (hours, relative — always 0 by construction,
// since index 0 is this file's shortest-lead/most-current slot) to noon
// UTC of that pointer date (this model's observed consistent daily
// anchor hour).
//
// Caching: HYCOM publishes a new "best" file once a day, so there's no
// reason to hit THREDDS more than a few times a day for the same result.
// 6-hour in-memory TTL (task-specified) — a single cached slot, not keyed
// by any param, since this endpoint takes none.
//
// Never throws on a third-party fetch failure: any failure (network,
// timeout, malformed pointer content, a variable region coming back with
// zero non-missing cells) degrades to null — the route layer turns that
// into a 502 (a bad/unusable upstream response), not a 500.

const FETCH_TIMEOUT_MS = 20_000; // Larger-than-typical payload (stride-sampled regional grid across 4 variables) — same magnitude reasoning as pacificFisheriesPurseSeineService's timeout.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export const HYCOM_POINTER_URL = "https://tds.pacificdata.org/thredds/fileServer/PCCOS/HYCOM/GLBy0.08_930_FMRC_best_YYYYMMDD.txt";
export const HYCOM_THREDDS_BASE = "https://tds.pacificdata.org/thredds/dodsC/PCCOS/HYCOM/GLBy0.08_930_FMRC_best_";

// Pacific Island region bounding box (task-specified).
const LAT_MIN = -25;
const LAT_MAX = 25;
const LON_MIN = 150;
const LON_MAX = 220;

// Confirmed-live grid size for today's file (lat=1426, lon=1388) — used
// only to build the full-array fetch; actual region indices are always
// located by scanning the real fetched lat/lon values below, never
// assumed from these sizes or from the grid's known 0.04°/0.08° spacing.
const LAT_SIZE = 1426;
const LON_SIZE = 1388;

// Every 10th grid point in each dimension when computing a regional mean
// (see file doc comment above) — ~11,000 cells/variable, not the ~1.09M
// a native-resolution fetch of this bounding box would mean.
const REGION_STRIDE = 10;

export const SOURCE_ATTRIBUTION =
  "HYCOM Global Ocean Model Forecast via Pacific Data Hub THREDDS (tds.pacificdata.org/thredds). Pacific Community (SPC). Model output — not instrument readings.";

export interface PacificOceanForecast {
  forecast_reference_date: string;
  valid_time: string;
  data_currency: "daily-forecast";
  model: "HYCOM GLBy0.08 Global Ocean Model";
  region: string;
  surface_temperature_c: number;
  current_speed_ms: number;
  current_direction_deg: number;
  sea_surface_elevation_m: number;
  region_sample_size: {
    water_temp: number;
    water_u: number;
    water_v: number;
    surf_el: number;
  };
  attribution: string;
  cached_at: string;
}

function toAsciiUrl(fileBaseUrl: string, query: string): string {
  return `${fileBaseUrl}.ascii?${query}`;
}

/** Same percent-encoding requirement as every other THREDDS endpoint in this codebase — see pacificFisheriesPurseSeineService.ts's identical note. Colons stay literal (valid in a query string, and OPeNDAP's slice syntax needs them). */
function sliceBrackets(startIdx: number, stride: number, stopIdx: number): string {
  return `%5B${startIdx}:${stride}:${stopIdx}%5D`;
}

/** Parses a simple (non-gridded) OPeNDAP ASCII array response, e.g. "lat[1426]\n-32.0, -31.96, ...". */
function parseFlatAsciiArray(ascii: string): number[] {
  const lines = ascii.split("\n");
  const sepIdx = lines.findIndex((line) => /^-+$/.test(line.trim()));
  if (sepIdx === -1) {
    throw new Error("Unexpected OPeNDAP ASCII response: no header separator line found");
  }
  return lines
    .slice(sepIdx + 2)
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

/**
 * Parses an OPeNDAP ASCII Grid response into a running sum + count of
 * non-missing values. Works for any number of leading sliced/ranged
 * index dimensions (surf_el has 2: time, lat before its free lon
 * dimension; water_temp/water_u/water_v have 3: time, depth, lat) by
 * matching one-or-more "[idx]" groups rather than a fixed count — e.g.
 * "[0][0], 1.2, NaN, ..." or "[0][0][12], 1.2, NaN, ...". NaN is this
 * dataset's declared missing-value marker (land/masked cells) — excluded
 * from both sum and count, never treated as a measured zero.
 */
function parseGridAsciiMean(ascii: string): { sum: number; count: number } {
  const lines = ascii.split("\n");
  const sepIdx = lines.findIndex((line) => /^-+$/.test(line.trim()));
  if (sepIdx === -1) {
    throw new Error("Unexpected OPeNDAP ASCII response: no header separator line found");
  }

  let sum = 0;
  let count = 0;
  for (let i = sepIdx + 1; i < lines.length; i++) {
    const match = lines[i]!.match(/^(?:\[\d+\])+,\s*(.+)$/);
    if (!match) continue;
    for (const raw of match[1]!.split(",")) {
      const value = Number(raw.trim());
      if (Number.isFinite(value)) {
        sum += value;
        count += 1;
      }
    }
  }
  return { sum, count };
}

/** First index i where coords[i] >= min, and last index i where coords[i] <= max. coords must be monotonically increasing (true for both lat and lon in this file). */
function findBoundingIndexRange(coords: number[], min: number, max: number): { minIdx: number; maxIdx: number } | null {
  let minIdx = -1;
  let maxIdx = -1;
  for (let i = 0; i < coords.length; i++) {
    if (coords[i]! >= min && coords[i]! <= max) {
      if (minIdx === -1) minIdx = i;
      maxIdx = i;
    }
  }
  return minIdx === -1 ? null : { minIdx, maxIdx };
}

async function fetchPointerDate(): Promise<string | null> {
  try {
    const response = await fetch(HYCOM_POINTER_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const text = (await response.text()).trim();
    return /^\d{8}$/.test(text) ? text : null; // malformed pointer content — not a valid YYYYMMDD
  } catch {
    return null;
  }
}

async function fetchCoordinateArrays(fileBaseUrl: string): Promise<{ lat: number[]; lon: number[] } | null> {
  try {
    const [latRes, lonRes] = await Promise.all([
      fetch(toAsciiUrl(fileBaseUrl, `lat${sliceBrackets(0, 1, LAT_SIZE - 1)}`), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
      fetch(toAsciiUrl(fileBaseUrl, `lon${sliceBrackets(0, 1, LON_SIZE - 1)}`), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
    ]);
    if (!latRes.ok || !lonRes.ok) return null;
    const [latText, lonText] = await Promise.all([latRes.text(), lonRes.text()]);
    return { lat: parseFlatAsciiArray(latText), lon: parseFlatAsciiArray(lonText) };
  } catch {
    return null;
  }
}

/** hours (relative) of this file's shortest-lead time-index (0) — always 0 by this file's own construction, fetched live rather than assumed (see file doc comment's time-reference caveat). */
async function fetchTimeIndexZeroHours(fileBaseUrl: string): Promise<number | null> {
  try {
    const response = await fetch(toAsciiUrl(fileBaseUrl, `time${sliceBrackets(0, 1, 0)}`), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const values = parseFlatAsciiArray(await response.text());
    return values[0] ?? null;
  } catch {
    return null;
  }
}

interface RegionMean {
  mean: number;
  count: number;
}

async function fetchRegionMean(
  fileBaseUrl: string,
  varName: string,
  hasDepth: boolean,
  latRange: { minIdx: number; maxIdx: number },
  lonRange: { minIdx: number; maxIdx: number },
): Promise<RegionMean | null> {
  const timeSlice = sliceBrackets(0, 1, 0);
  const depthSlice = hasDepth ? sliceBrackets(0, 1, 0) : "";
  const latSlice = sliceBrackets(latRange.minIdx, REGION_STRIDE, latRange.maxIdx);
  const lonSlice = sliceBrackets(lonRange.minIdx, REGION_STRIDE, lonRange.maxIdx);
  const query = `${varName}${timeSlice}${depthSlice}${latSlice}${lonSlice}`;

  try {
    const response = await fetch(toAsciiUrl(fileBaseUrl, query), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const { sum, count } = parseGridAsciiMean(await response.text());
    if (count === 0) return null; // no valid (non-land/non-masked) cells in the sampled region — a configuration problem, not a legitimate zero
    return { mean: sum / count, count };
  } catch {
    return null;
  }
}

let cache: { data: PacificOceanForecast; expires: number } | null = null;

/**
 * Today's Pacific Island region ocean surface forecast: mean surface
 * temperature, mean current speed/direction (derived from the mean
 * eastward/northward velocity vector, not an average of per-cell speeds),
 * and mean sea surface elevation, each from a stride-sampled subset of
 * HYCOM's GLBy0.08 grid. Returns null (never throws) on any upstream
 * failure — the route layer turns that into a 502.
 */
export async function getPacificOceanForecast(): Promise<PacificOceanForecast | null> {
  if (cache && Date.now() < cache.expires) return cache.data;

  const dateStr = await fetchPointerDate();
  if (!dateStr) return null;

  const forecastReferenceDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  const fileBaseUrl = `${HYCOM_THREDDS_BASE}${dateStr}.nc`;

  const coords = await fetchCoordinateArrays(fileBaseUrl);
  if (!coords) return null;

  const latRange = findBoundingIndexRange(coords.lat, LAT_MIN, LAT_MAX);
  const lonRange = findBoundingIndexRange(coords.lon, LON_MIN, LON_MAX);
  if (!latRange || !lonRange) return null;

  const timeIdxZeroHours = await fetchTimeIndexZeroHours(fileBaseUrl);
  if (timeIdxZeroHours === null) return null;

  const referenceNoonUtcMs = Date.UTC(Number(dateStr.slice(0, 4)), Number(dateStr.slice(4, 6)) - 1, Number(dateStr.slice(6, 8)), 12, 0, 0);
  const validTime = new Date(referenceNoonUtcMs + timeIdxZeroHours * 3_600_000).toISOString();

  const [temp, u, v, surfEl] = await Promise.all([
    fetchRegionMean(fileBaseUrl, "water_temp", true, latRange, lonRange),
    fetchRegionMean(fileBaseUrl, "water_u", true, latRange, lonRange),
    fetchRegionMean(fileBaseUrl, "water_v", true, latRange, lonRange),
    fetchRegionMean(fileBaseUrl, "surf_el", false, latRange, lonRange),
  ]);
  if (!temp || !u || !v || !surfEl) return null;

  // Mean of the vector components, not a mean of per-cell speeds/
  // directions — the physically meaningful way to get one "mean current"
  // for a region from linear u/v components. Oceanographic convention:
  // direction is where the current flows TOWARD, degrees clockwise from
  // north (the opposite convention from meteorological wind direction).
  const currentSpeedMs = Math.sqrt(u.mean * u.mean + v.mean * v.mean);
  const currentDirectionDeg = (Math.atan2(u.mean, v.mean) * (180 / Math.PI) + 360) % 360;

  const result: PacificOceanForecast = {
    forecast_reference_date: forecastReferenceDate,
    valid_time: validTime,
    data_currency: "daily-forecast",
    model: "HYCOM GLBy0.08 Global Ocean Model",
    region: "Pacific Island region (lat -25 to 25, lon 150–220)",
    surface_temperature_c: Math.round(temp.mean * 100) / 100,
    current_speed_ms: Math.round(currentSpeedMs * 1000) / 1000,
    current_direction_deg: Math.round(currentDirectionDeg * 10) / 10,
    sea_surface_elevation_m: Math.round(surfEl.mean * 1000) / 1000,
    region_sample_size: {
      water_temp: temp.count,
      water_u: u.count,
      water_v: v.count,
      surf_el: surfEl.count,
    },
    attribution: SOURCE_ATTRIBUTION,
    cached_at: new Date().toISOString(),
  };

  cache = { data: result, expires: Date.now() + CACHE_TTL_MS };
  return result;
}

/** Test-only: clears the in-memory cache between test cases. */
export function __resetOceanForecastCacheForTests(): void {
  cache = null;
}
