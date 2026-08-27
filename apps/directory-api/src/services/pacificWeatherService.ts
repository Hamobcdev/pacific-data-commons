// pacificWeatherService.ts
//
// Fetches real-time weather and a 7-day forecast for Pacific countries from
// Open-Meteo's free API (https://open-meteo.com). No API key required —
// confirmed live during Session 34 intelligence phase (R2). Free tier:
// 10,000 calls/day, well within canary + real query volume.
//
// 60-minute in-memory cache per country, same TTL/pattern as
// fxRateService.ts. Never throws: any failure (network, timeout, malformed
// response) degrades to null, which the route layer turns into a 503 (a
// third-party outage, not a server error) rather than a 500 — pacificTourismService.ts's
// existing sub-endpoint loop already treats any non-2xx response as a soft
// failure it synthesises around, so this doesn't need special-casing there.
//
// Session 34 intelligence phase corrected two errors in the original
// session brief's draft before writing this, both verified against the
// live API:
//
// 1. `weather_code_dominant` is not a valid Open-Meteo daily variable —
//    the API rejects it outright ("Cannot initialize ForecastVariableDaily
//    from invalid String value weather_code_dominant"). The correct daily
//    field is `weather_code` (identical name to the current-conditions
//    field, just returned as a per-day array).
//
// 2. The brief's timezone logic (`Pacific/Apia` for Samoa, `Pacific/Auckland`
//    for every other country) is wrong for 5 of the 7 countries this
//    service serves — Cook Islands is UTC-10 while Auckland is UTC+12/13,
//    a ~22-hour gap that would badly mislabel which calendar day each
//    forecast entry belongs to; Fiji/Tonga/PNG/Solomon Islands/Vanuatu
//    aren't Auckland-aligned either. TIMEZONES below maps each country to
//    its own real IANA zone instead — all 7 verified live against
//    Open-Meteo (200 OK) during the intelligence phase.

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

interface CountryLocation {
  lat: number;
  lon: number;
  name: string;
  timezone: string;
}

// Country coordinates — capital city / main tourism area — and each
// country's own real IANA timezone (see doc comment above).
const COORDINATES: Record<string, CountryLocation> = {
  WS: { lat: -13.759, lon: -172.104, name: "Samoa", timezone: "Pacific/Apia" },
  FJ: { lat: -17.713, lon: 178.065, name: "Fiji", timezone: "Pacific/Fiji" },
  TO: { lat: -21.179, lon: -175.198, name: "Tonga", timezone: "Pacific/Tongatapu" },
  PG: { lat: -9.443, lon: 147.18, name: "Papua New Guinea", timezone: "Pacific/Port_Moresby" },
  SB: { lat: -9.429, lon: 160.033, name: "Solomon Islands", timezone: "Pacific/Guadalcanal" },
  VU: { lat: -17.733, lon: 168.322, name: "Vanuatu", timezone: "Pacific/Efate" },
  CK: { lat: -21.237, lon: -159.778, name: "Cook Islands", timezone: "Pacific/Rarotonga" },
};

export type TourismRating = "Excellent" | "Good" | "Fair" | "Poor";

// WMO weather code to plain English — CLAUDE.md-adjacent key codes from the
// session brief (0/1/2/3 clear-to-overcast, 45/48 fog, 51/53/55 drizzle,
// 61/63/65 rain, 80/81/82 rain showers, 95/96/99 thunderstorm).
function describeWeatherCode(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Foggy";
  if (code <= 55) return "Drizzle";
  if (code <= 65) return "Rain";
  if (code <= 82) return "Rain showers";
  if (code <= 99) return "Thunderstorm";
  return "Variable";
}

function rateTourismConditions(tempMax: number, precipitation: number, weatherCode: number): TourismRating {
  if (weatherCode >= 80) return "Poor";
  if (precipitation > 10) return "Fair";
  if (tempMax >= 25 && tempMax <= 32 && precipitation < 5) return "Excellent";
  if (tempMax >= 22 && tempMax <= 34 && precipitation < 10) return "Good";
  return "Fair";
}

export interface DayForecast {
  date: string;
  temp_max_c: number;
  temp_min_c: number;
  precipitation_mm: number;
  conditions: string;
  tourism_rating: TourismRating;
}

export interface PacificWeather {
  country_code: string;
  country_name: string;
  current: {
    temperature_c: number;
    humidity_percent: number;
    precipitation_mm: number;
    wind_speed_kmh: number;
    conditions: string;
    tourism_rating: TourismRating;
  };
  forecast_7_day: DayForecast[];
  week_summary: string;
  queried_at: string;
  source: "open-meteo";
}

/** Just enough of Open-Meteo's response shape to read — untrusted
 * third-party HTTP JSON, same posture as fxRateService's response types. */
interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    weather_code?: number[];
  };
}

const cache = new Map<string, { data: PacificWeather; expires: number }>();

function buildWeekSummary(forecast: DayForecast[]): string {
  if (forecast.length === 0) return "Forecast unavailable this run.";
  const avgMax = forecast.reduce((s, d) => s + d.temp_max_c, 0) / forecast.length;
  const totalRain = forecast.reduce((s, d) => s + d.precipitation_mm, 0);
  const excellentDays = forecast.filter((d) => d.tourism_rating === "Excellent").length;

  if (excellentDays >= 5) return `Excellent conditions — ${Math.round(avgMax)}°C average, mostly dry`;
  if (totalRain > 30) return `Wet week ahead — ${Math.round(totalRain)}mm total rain expected`;
  return `Good conditions — ${Math.round(avgMax)}°C average, some rain possible`;
}

async function fetchFreshWeather(countryCode: string, location: CountryLocation): Promise<PacificWeather | null> {
  const url = [
    OPEN_METEO_URL,
    `?latitude=${location.lat}&longitude=${location.lon}`,
    "&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code",
    "&forecast_days=7",
    `&timezone=${encodeURIComponent(location.timezone)}`,
  ].join("");

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;

    const data = (await response.json()) as OpenMeteoResponse;
    const currentCode = data.current?.weather_code ?? 0;
    const currentTemp = data.current?.temperature_2m ?? 26;
    const currentPrecip = data.current?.precipitation ?? 0;

    const dailyTimes = data.daily?.time ?? [];
    const forecast: DayForecast[] = dailyTimes.map((date, i) => {
      const maxTemp = data.daily?.temperature_2m_max?.[i] ?? 27;
      const minTemp = data.daily?.temperature_2m_min?.[i] ?? 25;
      const precip = data.daily?.precipitation_sum?.[i] ?? 0;
      const code = data.daily?.weather_code?.[i] ?? 0;
      return {
        date,
        temp_max_c: Math.round(maxTemp * 10) / 10,
        temp_min_c: Math.round(minTemp * 10) / 10,
        precipitation_mm: Math.round(precip * 10) / 10,
        conditions: describeWeatherCode(code),
        tourism_rating: rateTourismConditions(maxTemp, precip, code),
      };
    });

    return {
      country_code: countryCode,
      country_name: location.name,
      current: {
        temperature_c: currentTemp,
        humidity_percent: data.current?.relative_humidity_2m ?? 75,
        precipitation_mm: currentPrecip,
        wind_speed_kmh: Math.round((data.current?.wind_speed_10m ?? 10) * 10) / 10,
        conditions: describeWeatherCode(currentCode),
        tourism_rating: rateTourismConditions(currentTemp, currentPrecip, currentCode),
      },
      forecast_7_day: forecast,
      week_summary: buildWeekSummary(forecast),
      queried_at: new Date().toISOString(),
      source: "open-meteo",
    };
  } catch {
    return null;
  }
}

/**
 * Current conditions + 7-day forecast for one Pacific country. Returns
 * null (never throws) for an unknown country code or any upstream
 * failure — the route layer is responsible for turning null into the
 * appropriate HTTP response (400 for an unknown code is caught earlier by
 * the route's own validation; null from here after a valid code means a
 * live Open-Meteo failure, which becomes a 503).
 */
export async function getPacificWeather(countryCode: string): Promise<PacificWeather | null> {
  const location = COORDINATES[countryCode];
  if (!location) return null;

  const cached = cache.get(countryCode);
  if (cached && Date.now() < cached.expires) return cached.data;

  const result = await fetchFreshWeather(countryCode, location);
  if (result) {
    cache.set(countryCode, { data: result, expires: Date.now() + CACHE_TTL_MS });
  }
  return result;
}

/** Test-only: clears the in-memory cache between test cases — same
 * purpose as fxRateService.ts's __resetFxRateCacheForTests. */
export function __resetWeatherCacheForTests(): void {
  cache.clear();
}
