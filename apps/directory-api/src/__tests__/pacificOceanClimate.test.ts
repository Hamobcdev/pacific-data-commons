import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pacificOceanTemperatureRoute } from "../routes/climate/ocean-temperature.js";
import { getPacificOceanClimate, __resetOceanClimateCacheForTests } from "../services/pacificOceanClimateService.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const OPEN_METEO_MARINE_SAMOA_RESPONSE = {
  current: { sea_surface_temperature: 28.4, wave_height: 1.2, wave_period: 7.5, wave_direction: 145, ocean_current_velocity: 0.8 },
  daily: {
    time: ["2026-09-24", "2026-09-25"],
    wave_height_max: [1.4, 1.1],
    wave_period_max: [8.1, 7.2],
  },
};

function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = {} as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });

  app.route("/", pacificOceanTemperatureRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("getPacificOceanClimate", () => {
  beforeEach(() => {
    __resetOceanClimateCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetOceanClimateCacheForTests();
  });

  it("returns null for an unknown country code without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getPacificOceanClimate("US");

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("queries Open-Meteo Marine with the correct per-country coordinates and timezone", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain(OPEN_METEO_MARINE_URL);
      expect(url).toContain("latitude=-13.759");
      expect(url).toContain(`timezone=${encodeURIComponent("Pacific/Apia")}`);
      return jsonResponse(OPEN_METEO_MARINE_SAMOA_RESPONSE);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getPacificOceanClimate("WS");

    expect(result).not.toBeNull();
    expect(result?.country_name).toBe("Samoa");
    expect(result?.current.sea_surface_temperature_c).toBe(28.4);
    expect(result?.current.wave_height_m).toBe(1.2);
    const forecast = result?.forecast_7_day ?? [];
    expect(forecast).toHaveLength(2);
    expect(forecast[0]).toEqual({ date: "2026-09-24", wave_height_max_m: 1.4, wave_period_max_s: 8.1 });
    expect(result?.source).toBe("open-meteo-marine");

    // Decision 59/60: honest, non-national-authority-certified attribution.
    expect(result?.attribution.source).toBe("Open-Meteo Marine Weather API");
    expect(result?.attribution.data_quality).toBe("third_party_aggregated");
    expect(result?.attribution.disclaimer).toContain("not a national meteorology service");
  });

  it("uses the correct coordinates for a non-Samoa country (Cook Islands, not Auckland)", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain(`timezone=${encodeURIComponent("Pacific/Rarotonga")}`);
      return jsonResponse(OPEN_METEO_MARINE_SAMOA_RESPONSE);
    });
    vi.stubGlobal("fetch", fetchSpy);

    await getPacificOceanClimate("CK");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns null (never throws) when Open-Meteo Marine returns a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: true }, 400)));

    const result = await getPacificOceanClimate("WS");
    expect(result).toBeNull();
  });

  it("returns null (never throws) when the fetch itself rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );

    const result = await getPacificOceanClimate("WS");
    expect(result).toBeNull();
  });

  it("caches results for the 3-hour TTL — a second call within the window doesn't re-fetch", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(OPEN_METEO_MARINE_SAMOA_RESPONSE));
    vi.stubGlobal("fetch", fetchSpy);

    await getPacificOceanClimate("WS");
    await getPacificOceanClimate("WS");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("GET /climate/ocean-temperature", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetOceanClimateCacheForTests();
  });

  it("returns 400 when country is missing", async () => {
    const app = buildTestApp();
    const res = await app.request("/climate/ocean-temperature");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("returns 400 for an invalid country", async () => {
    const app = buildTestApp();
    const res = await app.request("/climate/ocean-temperature?country=US");
    expect(res.status).toBe(400);
  });

  it("returns 200 with ocean climate data and Cache-Control for a valid country", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(OPEN_METEO_MARINE_SAMOA_RESPONSE)));

    const app = buildTestApp();
    const res = await app.request("/climate/ocean-temperature?country=WS");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=10800");

    const body = (await res.json()) as { country_code: string; current: { sea_surface_temperature_c: number } };
    expect(body.country_code).toBe("WS");
    expect(body.current.sea_surface_temperature_c).toBe(28.4);
  });

  it("returns 503 (not 500) when Open-Meteo Marine is unavailable for a valid country", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );

    const app = buildTestApp();
    const res = await app.request("/climate/ocean-temperature?country=WS");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("service_unavailable");
  });
});
