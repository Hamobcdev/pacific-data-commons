import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pacificWeatherRoute } from "../routes/pacific/weather.js";
import { getPacificWeather, __resetWeatherCacheForTests } from "../services/pacificWeatherService.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const OPEN_METEO_SAMOA_RESPONSE = {
  current: { temperature_2m: 25.8, relative_humidity_2m: 78, precipitation: 0, wind_speed_10m: 4.3, weather_code: 2 },
  daily: {
    time: ["2026-08-27", "2026-08-28"],
    temperature_2m_max: [26.8, 27.2],
    temperature_2m_min: [25.3, 25.8],
    precipitation_sum: [0.2, 12.5],
    weather_code: [51, 81],
  },
};

function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = {} as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });

  app.route("/", pacificWeatherRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("getPacificWeather", () => {
  beforeEach(() => {
    __resetWeatherCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetWeatherCacheForTests();
  });

  it("returns null for an unknown country code without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getPacificWeather("US");

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("queries Open-Meteo with the correct per-country timezone and translates WMO codes to plain English", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain(OPEN_METEO_URL);
      expect(url).toContain("latitude=-13.759");
      expect(url).toContain(`timezone=${encodeURIComponent("Pacific/Apia")}`);
      return jsonResponse(OPEN_METEO_SAMOA_RESPONSE);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getPacificWeather("WS");

    expect(result).not.toBeNull();
    expect(result?.country_name).toBe("Samoa");
    expect(result?.current.temperature_c).toBe(25.8);
    expect(result?.current.conditions).toBe("Partly cloudy"); // WMO code 2
    const forecast = result?.forecast_7_day ?? [];
    expect(forecast).toHaveLength(2);
    expect(forecast[0]?.conditions).toBe("Drizzle"); // WMO code 51
    expect(forecast[1]?.conditions).toBe("Rain showers"); // WMO code 81
    expect(forecast[1]?.tourism_rating).toBe("Poor"); // weather_code 81 >= 80
    expect(result?.source).toBe("open-meteo");
  });

  it("uses the correct timezone for a non-Samoa country (Cook Islands, not Auckland)", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain(`timezone=${encodeURIComponent("Pacific/Rarotonga")}`);
      return jsonResponse(OPEN_METEO_SAMOA_RESPONSE);
    });
    vi.stubGlobal("fetch", fetchSpy);

    await getPacificWeather("CK");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns null (never throws) when Open-Meteo returns a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: true }, 400)));

    const result = await getPacificWeather("WS");
    expect(result).toBeNull();
  });

  it("returns null (never throws) when the fetch itself rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );

    const result = await getPacificWeather("WS");
    expect(result).toBeNull();
  });

  it("caches results for 60 minutes — a second call within the window doesn't re-fetch", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(OPEN_METEO_SAMOA_RESPONSE));
    vi.stubGlobal("fetch", fetchSpy);

    await getPacificWeather("WS");
    await getPacificWeather("WS");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("GET /pacific/weather", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetWeatherCacheForTests();
  });

  it("returns 400 when country is missing", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/weather");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("returns 400 for an invalid country", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/weather?country=US");
    expect(res.status).toBe(400);
  });

  it("returns 200 with weather data for a valid country", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(OPEN_METEO_SAMOA_RESPONSE)));

    const app = buildTestApp();
    const res = await app.request("/pacific/weather?country=WS");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { country_code: string; current: { temperature_c: number } };
    expect(body.country_code).toBe("WS");
    expect(body.current.temperature_c).toBe(25.8);
  });

  it("returns 503 (not 500) when Open-Meteo is unavailable for a valid country", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );

    const app = buildTestApp();
    const res = await app.request("/pacific/weather?country=WS");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("service_unavailable");
  });
});
