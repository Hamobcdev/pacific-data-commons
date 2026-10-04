// pacificFisheriesPurseSeineService.ts
//
// Historical annual purse seine catch totals for the Western and Central
// Pacific Ocean, sourced from WCPFC's Public Domain 1°x1° Monthly dataset,
// served via Pacific Data Hub's THREDDS OPeNDAP server — no API key
// required, confirmed live during this session.
//
// IMPORTANT — the real dataset does not match a flat "SKJ_C/YFT_C/BET_C/
// ALB_C/SETS annual series, 1950s–2022/2023" shape that was originally
// assumed for this endpoint. Confirmed live against the THREDDS .dds/.das
// for WCPFC_S_PUBLIC_BY_1x1_MM.nc before writing this file:
//
//   - The file lives at PCCOS/WCPFC/..., not PCCOSdata/WCPFC/... (that
//     path 404s — PCCOSdata is only the internal catalog dataset ID used
//     in THREDDS query params, not a URL path segment).
//   - There is no single SKJ_C/YFT_C/BET_C/SETS variable. Catch and sets
//     are each split 5 ways by fishing-gear/set type: {skj,yft,bet,oth}_c_
//     {una,log,dfad,afad,oth} (unassociated / log-or-debris / drifting FAD
//     / anchored FAD / other set types), plus sets_{una,log,dfad,afad,oth}.
//     A species' total catch for a year is the sum of its 5 gear-mode
//     variables across every grid cell and every month in that year — not
//     a single scalar lookup.
//   - There is NO Albacore (alb) variable anywhere in this dataset.
//     Scientifically expected: albacore is a longline/troll target
//     species, not meaningfully caught by purse seine, so WCPFC's own
//     purse-seine 1x1 gridded product has no albacore field to serve.
//     "oth_c_*" is a generic other-species bucket, not albacore — must
//     never be mislabelled as albacore. Only skj/yft/bet are served; a
//     request for alb is rejected at the route layer with an explicit
//     explanation (see routes/fisheries/pacific-purse-seine.ts), not
//     silently answered with a fabricated zero.
//   - Real coverage is 1967-12 (time index 0, "days since 1967-12-01" = 0)
//     through 2021-12 (time index 627, day 19724) — not "1950s–2022/2023".
//     year_range_covered is computed from the live time array on every
//     request (see getTimeIndexYears below), not hardcoded, so it tracks
//     automatically if PCCOS ever republishes with more months.
//   - The file is a monthly 1°x1° grid (time=628, latitude=100,
//     longitude=124), ~1.6GB unconstrained. One month of one gear-mode
//     variable across the full grid is ~65KB of ASCII (confirmed live);
//     a full year (up to 12 months) of all 5 gear variables for one
//     species is therefore ~4MB — fetchable with a year filter, but the
//     full 628-month series would be ~200MB+ of ASCII in one request,
//     which is not workable for a live paid HTTP endpoint. That's why
//     year is a REQUIRED query param here (see the route), not optional.
//
// MIN_YEAR/MAX_YEAR below are this session's live-verified bounds. If
// PCCOS republishes this file with a wider time range, these need
// updating — they're a deliberate hardcoded bound, not derived from a
// schema, so the route can reject a nonsensical year (e.g. 1800 or 2099)
// synchronously before making any upstream call.
//
// Caching: this is an annual historical archive, re-published on WCPFC's
// own multi-year verification cycle — there's no reason to hit THREDDS
// more than once a day for the same species+year. 24-hour in-memory TTL,
// same magnitude as samoaCpiService's 24h cache (also annual-cadence
// data), keyed per species+year. The time-index-to-year mapping (needed
// to locate which time indices fall in a requested year) is fetched once
// and cached under the same 24h TTL — it's a single ~628-value array, so
// this is cheap, and every species+year request needs it anyway to find
// its time-index range.
//
// Never throws on a third-party fetch failure: any failure (network,
// timeout, malformed response) degrades to null, same posture as
// pacificOceanClimateService.ts and pacificWaterTemperatureService.ts —
// the route layer turns a null into a 503 (third-party outage), not a
// 500. A legitimate zero-report year (can happen in the sparse 1968-era
// record) is NOT an error — it's an honest result with record_count: 0,
// not conflated with an upstream failure.
//
// P10 / Decision 59 posture: this endpoint reports WCPFC's own published
// aggregate as structured data only. It makes no stock-assessment,
// licensing, or quality judgement of any kind — see SOURCE_ATTRIBUTION
// and REPORTING_LAG_NOTE below, both surfaced verbatim in every response.

const FETCH_TIMEOUT_MS = 20_000; // Larger grid payload than this codebase's other first-party services (up to ~900KB per gear variable) — longer timeout than samoaCpiService's/pacificOceanClimateService's 8–10s.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const THREDDS_WCPFC_URL = "https://tds.pacificdata.org/thredds/dodsC/PCCOS/WCPFC/WCPFC_S_PUBLIC_BY_1x1_MM.nc";

// "days since 1967-12-01 00:00:00" (confirmed live via the dataset's own
// .das — time:units). calendar "proleptic_gregorian", but a plain UTC
// Date is exact for this purpose (no DST/leap-second concerns at
// day-granularity arithmetic).
const TIME_ORIGIN_MS = Date.UTC(1967, 11, 1);

// Confirmed live: latitude = 100, longitude = 124 cells (1°x1° grid).
const LATITUDE_SIZE = 100;
const LONGITUDE_SIZE = 124;

const GEAR_MODES = ["una", "log", "dfad", "afad", "oth"] as const;

export type SpeciesCode = "skj" | "yft" | "bet";

const SPECIES_COMMON_NAMES: Record<SpeciesCode, string> = {
  skj: "Skipjack Tuna",
  yft: "Yellowfin Tuna",
  bet: "Bigeye Tuna",
};

export const DEFAULT_SPECIES: SpeciesCode = "skj";
export const VALID_SPECIES: readonly SpeciesCode[] = ["skj", "yft", "bet"];

export function isValidSpecies(code: string): code is SpeciesCode {
  return (VALID_SPECIES as readonly string[]).includes(code);
}

// Live-verified bounds (see file doc comment above) — not derived from a
// schema, so the route can reject an out-of-range year synchronously.
export const MIN_YEAR = 1967;
export const MAX_YEAR = 2021;

export const REPORTING_LAG_NOTE =
  "WCPFC member catch reports are verified 1–2 years after fishing year. Data reflects completed reporting cycles only.";

export const SOURCE_ATTRIBUTION =
  "WCPFC Public Domain Aggregated Catch/Effort Data — Purse Seine 1°x1° Monthly. Western and Central Pacific Fisheries Commission. tds.pacificdata.org";

export interface PurseSeineCatchResult {
  species_code: SpeciesCode;
  common_name: string;
  total_catch_mt: number;
  year_filter: number;
  year_range_covered: string;
  data_currency: "historical";
  reporting_lag_note: string;
  record_count: number;
  unit: "metric_tonnes";
  attribution: string;
  cached_at: string;
}

function toAsciiUrl(query: string): string {
  return `${THREDDS_WCPFC_URL}.ascii?${query}`;
}

/**
 * OPeNDAP's constraint-expression brackets ([a:b:c]) are rejected
 * unencoded by this THREDDS server (confirmed live: a literal `[` returns
 * HTTP 400 "Invalid character found in the request target") — curl's own
 * URL-globbing feature hits the same character for an unrelated reason.
 * Percent-encoding just the brackets (not the colons, which OPeNDAP's
 * slice syntax needs literally and which are valid in a query string per
 * RFC 3986) is what a live request against this server actually needs.
 */
function gridSliceQuery(varName: string, minTimeIdx: number, maxTimeIdx: number): string {
  return `${varName}%5B${minTimeIdx}:1:${maxTimeIdx}%5D%5B0:1:${LATITUDE_SIZE - 1}%5D%5B0:1:${LONGITUDE_SIZE - 1}%5D`;
}

/**
 * Parses one variable's OPeNDAP ASCII Grid response into a running sum +
 * count of non-missing values. Grid data rows look like
 * "[0][12], 1.2, NaN, 3.4, ..." — one row per (time, latitude) pair, each
 * with LONGITUDE_SIZE comma-separated values. NaN is this dataset's
 * declared _FillValue (no report for that cell/month) — excluded from
 * both sum and count, not treated as a measured zero. Lines after the
 * main grid block (the accompanying time/latitude/longitude map sections)
 * don't match the "[t][lat]," row prefix and are safely skipped.
 */
function parseGridAsciiSum(ascii: string): { sum: number; count: number } {
  const lines = ascii.split("\n");
  const sepIdx = lines.findIndex((line) => /^-+$/.test(line.trim()));
  if (sepIdx === -1) {
    throw new Error("Unexpected OPeNDAP ASCII response: no header separator line found");
  }

  let sum = 0;
  let count = 0;
  for (let i = sepIdx + 1; i < lines.length; i++) {
    const match = lines[i]!.match(/^\[\d+\]\[\d+\],\s*(.+)$/);
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

/** Parses a simple (non-gridded) OPeNDAP ASCII array response, e.g. "time[628]\n0.0, 31.0, ...". Used only for the time map. */
function parseFlatAsciiArray(ascii: string): number[] {
  const lines = ascii.split("\n");
  const sepIdx = lines.findIndex((line) => /^-+$/.test(line.trim()));
  if (sepIdx === -1) {
    throw new Error("Unexpected OPeNDAP ASCII response: no header separator line found");
  }
  // sepIdx+1 is the "time[628]" label line; the comma-separated values
  // follow on the next line(s).
  return lines
    .slice(sepIdx + 2)
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

function dayOffsetToYear(dayOffset: number): number {
  return new Date(TIME_ORIGIN_MS + dayOffset * 86_400_000).getUTCFullYear();
}

let timeYearsCache: { years: number[]; expires: number } | null = null;

/** Fetches (or returns cached) the calendar year for every one of the dataset's 628 monthly time-array entries. */
async function getTimeIndexYears(): Promise<number[]> {
  if (timeYearsCache && Date.now() < timeYearsCache.expires) {
    return timeYearsCache.years;
  }

  const response = await fetch(toAsciiUrl("time"), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`THREDDS time array fetch returned HTTP ${response.status}`);
  }
  const days = parseFlatAsciiArray(await response.text());
  const years = days.map(dayOffsetToYear);

  timeYearsCache = { years, expires: Date.now() + CACHE_TTL_MS };
  return years;
}

/** Time is monotonically increasing by index, so every index for a single calendar year occupies one contiguous run — a single [min:1:max] slice covers exactly that year's months, nothing else. */
function findYearIndexRange(years: number[], year: number): { minIdx: number; maxIdx: number } | null {
  let minIdx = -1;
  let maxIdx = -1;
  for (let i = 0; i < years.length; i++) {
    if (years[i] === year) {
      if (minIdx === -1) minIdx = i;
      maxIdx = i;
    }
  }
  return minIdx === -1 ? null : { minIdx, maxIdx };
}

async function fetchGearVariable(species: SpeciesCode, gear: (typeof GEAR_MODES)[number], minIdx: number, maxIdx: number): Promise<{ sum: number; count: number } | null> {
  const varName = `${species}_c_${gear}`;
  try {
    const response = await fetch(toAsciiUrl(gridSliceQuery(varName, minIdx, maxIdx)), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    return parseGridAsciiSum(await response.text());
  } catch {
    return null;
  }
}

/**
 * Sums all 5 gear-mode variables for one species over one year's time-
 * index range. If ANY of the 5 upstream fetches fails, the whole result
 * is null (not a partial sum silently missing a gear mode) — an
 * undercounted catch total is a worse data-integrity failure than a
 * clear 503, especially for a dataset meant to support stock-assessment
 * and licensing use.
 */
async function fetchCatchForYear(species: SpeciesCode, minIdx: number, maxIdx: number): Promise<{ sum: number; count: number } | null> {
  const results = await Promise.all(GEAR_MODES.map((gear) => fetchGearVariable(species, gear, minIdx, maxIdx)));
  if (results.some((r) => r === null)) return null;

  let sum = 0;
  let count = 0;
  for (const r of results) {
    sum += r!.sum;
    count += r!.count;
  }
  return { sum, count };
}

const cache = new Map<string, { data: PurseSeineCatchResult; expires: number }>();

/**
 * Total purse seine catch (metric tonnes) for one species in one year,
 * summed across all 5 fishing-gear/set-type variables and the full
 * Western/Central Pacific 1°x1° grid. Returns null (never throws) on any
 * upstream failure — the route layer turns that into a 503. A year with
 * zero matching time-array entries (possible in the sparse 1968-era
 * record even within MIN_YEAR..MAX_YEAR) returns an honest zero with
 * record_count: 0, not an error — record_count makes that distinction
 * visible to the caller rather than silently fabricating a measured
 * value.
 */
export async function getPurseSeineCatch(species: SpeciesCode, year: number): Promise<PurseSeineCatchResult | null> {
  const cacheKey = `${species}:${year}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expires) return cached.data;

  let years: number[];
  try {
    years = await getTimeIndexYears();
  } catch {
    return null;
  }

  const yearRangeCovered = `${years[0]}–${years[years.length - 1]}`;
  const range = findYearIndexRange(years, year);

  let totalCatchMt = 0;
  let recordCount = 0;

  if (range) {
    const aggregate = await fetchCatchForYear(species, range.minIdx, range.maxIdx);
    if (!aggregate) return null;
    totalCatchMt = aggregate.sum;
    recordCount = aggregate.count;
  }

  const result: PurseSeineCatchResult = {
    species_code: species,
    common_name: SPECIES_COMMON_NAMES[species],
    total_catch_mt: Math.round(totalCatchMt * 100) / 100,
    year_filter: year,
    year_range_covered: yearRangeCovered,
    data_currency: "historical",
    reporting_lag_note: REPORTING_LAG_NOTE,
    record_count: recordCount,
    unit: "metric_tonnes",
    attribution: SOURCE_ATTRIBUTION,
    cached_at: new Date().toISOString(),
  };

  cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL_MS });
  return result;
}

/** Test-only: clears both in-memory caches between test cases. */
export function __resetFisheriesCacheForTests(): void {
  cache.clear();
  timeYearsCache = null;
}
