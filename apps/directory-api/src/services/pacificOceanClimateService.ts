// pacificOceanClimateService.ts
//
// Sea surface temperature and wave/swell conditions for Pacific countries,
// sourced from Open-Meteo's free Marine Weather API
// (https://marine-api.open-meteo.com) — no API key required for
// non-commercial use, confirmed live during this session (a plain unauthed
// request against the live API returned 200 with real data). Distinct from
// pacificWeatherService.ts's /pacific/weather (air temperature, humidity,
// precipitation, tourism forecast) — this endpoint is ocean-condition data,
// the "Ocean" half of the Fisheries/Climate Risk agent pairing described in
// CLAUDE.md Section 19 ("ocean temperature context is required for
// scientifically valid fisheries interpretation").
//
// Same 7-country coordinate set as pacificWeatherService.ts, reused as-is
// (already verified live against Open-Meteo's main forecast API — the
// marine API takes the same latitude/longitude/timezone parameters).
//
// Caching: 3-hour in-memory TTL per country — longer than
// pacificWeatherService's 60-minute TTL (air weather models refresh
// roughly hourly) because ocean wave-model runs (the underlying NOAA
// WaveWatch III / DWD ICON marine models Open-Meteo blends) update on a
// multi-hour cadence, and sea surface temperature itself moves on an
// hours-to-days timescale, not minute-to-minute — a much shorter window
// than samoa-cpi's 24h (annual economic data) is still warranted since
// wave height/period genuinely change through the day.
//
// Never throws: any failure (network, timeout, malformed response)
// degrades to null, same posture as pacificWeatherService.ts — the route
// layer turns a null into a 503 (third-party outage), not a 500.
//
// P10 / Decision 59 posture: this endpoint reports Open-Meteo's own model
// output as structured data only. It makes no fisheries-stock, safety, or
// quality judgement of any kind — that would cross into the quality
// assessment role P10 and CLAUDE.md Section 8 explicitly forbid SBP from
// taking. See SOURCE_ATTRIBUTION below, surfaced verbatim in every
// response.

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

const OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";

interface CountryLocation {
  lat: number;
  lon: number;
  name: string;
  timezone: string;
}

// Same coordinates/timezones as pacificWeatherService.ts's COORDINATES —
// duplicated rather than imported to keep each service independently
// deployable/testable, same posture as this codebase's other per-service
// constant tables (fxRateService, samoaCpiService each own their constants).
const COORDINATES: Record<string, CountryLocation> = {
  WS: { lat: -13.759, lon: -172.104, name: "Samoa", timezone: "Pacific/Apia" },
  FJ: { lat: -17.713, lon: 178.065, name: "Fiji", timezone: "Pacific/Fiji" },
  TO: { lat: -21.179, lon: -175.198, name: "Tonga", timezone: "Pacific/Tongatapu" },
  PG: { lat: -9.443, lon: 147.18, name: "Papua New Guinea", timezone: "Pacific/Port_Moresby" },
  SB: { lat: -9.429, lon: 160.033, name: "Solomon Islands", timezone: "Pacific/Guadalcanal" },
  VU: { lat: -17.733, lon: 168.322, name: "Vanuatu", timezone: "Pacific/Efate" },
  CK: { lat: -21.237, lon: -159.778, name: "Cook Islands", timezone: "Pacific/Rarotonga" },
};

export const SOURCE_ATTRIBUTION = {
  source: "Open-Meteo Marine Weather API",
  source_url: OPEN_METEO_MARINE_URL,
  original_source: "Open-Meteo's own blended marine forecast models (NOAA WaveWatch III / DWD ICON wave and ocean models, per Open-Meteo's published model sourcing) — not a single national meteorological, oceanographic, or fisheries authority",
  data_quality: "third_party_aggregated" as const,
  disclaimer:
    "This endpoint serves Open-Meteo's own published marine model output via PDC's structured queryable layer. This is not a national meteorology service-, SPC-, or fisheries-authority-certified feed — SBP has not independently verified this data against any national or regional agency, and makes no assessment of fish stock health, safety, or data quality. Do not present this as a certified stock assessment or safety-critical marine forecast.",
  // Same rationale as samoaCpiService.ts's identical field.
  revenue_tracking_note:
    "Payments for this endpoint settle to a dedicated wallet tracked separately from SBP's main directory revenue, as part of an institutional/MVP earnings pilot for first-party open-data endpoints (Decision 59/60).",
};

export interface DayOceanForecast {
  date: string;
  wave_height_max_m: number;
  wave_period_max_s: number;
}

export interface PacificOceanClimate {
  country_code: string;
  country_name: string;
  current: {
    sea_surface_temperature_c: number | null;
    wave_height_m: number | null;
    wave_period_s: number | null;
    wave_direction_deg: number | null;
    ocean_current_velocity_kmh: number | null;
  };
  forecast_7_day: DayOceanForecast[];
  week_summary: string;
  queried_at: string;
  source: "open-meteo-marine";
  attribution: typeof SOURCE_ATTRIBUTION;
}

/** Just enough of Open-Meteo Marine's response shape to read — untrusted third-party HTTP JSON, same posture as pacificWeatherService's OpenMeteoResponse. */
interface OpenMeteoMarineResponse {
  current?: {
    sea_surface_temperature?: number;
    wave_height?: number;
    wave_period?: number;
    wave_direction?: number;
    ocean_current_velocity?: number;
  };
  daily?: {
    time?: string[];
    wave_height_max?: number[];
    wave_period_max?: number[];
  };
}

const cache = new Map<string, { data: PacificOceanClimate; expires: number }>();

function buildWeekSummary(current: PacificOceanClimate["current"], forecast: DayOceanForecast[]): string {
  if (current.sea_surface_temperature_c === null && forecast.length === 0) {
    return "Ocean condition data unavailable this run.";
  }
  const sstPart = current.sea_surface_temperature_c !== null ? `Sea surface ${current.sea_surface_temperature_c}°C` : "Sea surface temperature unavailable";
  if (forecast.length === 0) return `${sstPart}. Forecast unavailable this run.`;
  const avgMaxWave = forecast.reduce((s, d) => s + d.wave_height_max_m, 0) / forecast.length;
  return `${sstPart}, average forecast wave height ${Math.round(avgMaxWave * 10) / 10}m over the next ${forecast.length} days`;
}

async function fetchFreshOceanClimate(countryCode: string, location: CountryLocation): Promise<PacificOceanClimate | null> {
  const url = [
    OPEN_METEO_MARINE_URL,
    `?latitude=${location.lat}&longitude=${location.lon}`,
    "&current=sea_surface_temperature,wave_height,wave_period,wave_direction,ocean_current_velocity",
    "&daily=wave_height_max,wave_period_max",
    "&forecast_days=7",
    `&timezone=${encodeURIComponent(location.timezone)}`,
  ].join("");

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;

    const data = (await response.json()) as OpenMeteoMarineResponse;

    const current = {
      sea_surface_temperature_c: data.current?.sea_surface_temperature ?? null,
      wave_height_m: data.current?.wave_height ?? null,
      wave_period_s: data.current?.wave_period ?? null,
      wave_direction_deg: data.current?.wave_direction ?? null,
      ocean_current_velocity_kmh: data.current?.ocean_current_velocity ?? null,
    };

    const dailyTimes = data.daily?.time ?? [];
    const forecast: DayOceanForecast[] = dailyTimes.map((date, i) => ({
      date,
      wave_height_max_m: data.daily?.wave_height_max?.[i] ?? 0,
      wave_period_max_s: data.daily?.wave_period_max?.[i] ?? 0,
    }));

    return {
      country_code: countryCode,
      country_name: location.name,
      current,
      forecast_7_day: forecast,
      week_summary: buildWeekSummary(current, forecast),
      queried_at: new Date().toISOString(),
      source: "open-meteo-marine",
      attribution: SOURCE_ATTRIBUTION,
    };
  } catch {
    return null;
  }
}

/**
 * Current sea surface temperature/wave conditions + 7-day wave forecast
 * for one Pacific country. Returns null (never throws) for an unknown
 * country code or any upstream failure — the route layer turns a valid
 * code's null into a 503 (live Open-Meteo failure), same as
 * pacificWeatherService.getPacificWeather.
 */
export async function getPacificOceanClimate(countryCode: string): Promise<PacificOceanClimate | null> {
  const location = COORDINATES[countryCode];
  if (!location) return null;

  const cached = cache.get(countryCode);
  if (cached && Date.now() < cached.expires) return cached.data;

  const result = await fetchFreshOceanClimate(countryCode, location);
  if (result) {
    cache.set(countryCode, { data: result, expires: Date.now() + CACHE_TTL_MS });
  }
  return result;
}

/** Test-only: clears the in-memory cache between test cases. */
export function __resetOceanClimateCacheForTests(): void {
  cache.clear();
}
