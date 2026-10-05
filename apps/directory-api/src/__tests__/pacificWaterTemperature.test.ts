import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pacificWaterTemperatureRoute } from "../routes/climate/pacific-ocean-temp.js";
import { getPacificWaterTemperature, __resetWaterTemperatureCacheForTests } from "../services/pacificWaterTemperatureService.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const NOAA_DATAGETTER_URL = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const NOAA_PAGO_PAGO_RESPONSE = {
  metadata: { id: "1770000", name: "Pago Pago, American Samoa" },
  data: [
    { t: "2026-10-01 15:00", v: "26.3", f: "0,0,0" },
    { t: "2026-10-01 15:06", v: "26.4", f: "0,0,0" },
  ],
};

function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = {} as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });

  app.route("/", pacificWaterTemperatureRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("getPacificWaterTemperature", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetWaterTemperatureCacheForTests();
  });

  it("returns null for an unknown station without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getPacificWaterTemperature("9999999");

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("queries NOAA CO-OPS with the correct station and returns the most recent reading", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain(NOAA_DATAGETTER_URL);
      expect(url).toContain("station=1770000");
      expect(url).toContain("units=metric");
      expect(url).toContain("time_zone=gmt");
      return jsonResponse(NOAA_PAGO_PAGO_RESPONSE);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getPacificWaterTemperature("1770000");

    expect(result).not.toBeNull();
    expect(result?.nation).toBe("American Samoa");
    expect(result?.indicator).toBe("sea_water_temperature");
    // Most recent reading (last array element), not the first.
    expect(result?.value).toBe(26.4);
    expect(result?.unit).toBe("celsius");
    expect(result?.period).toBe("2026-10-01T15:06:00Z");
    expect(result?.attribution).toBe("NOAA CO-OPS / National Ocean Service — tidesandcurrents.noaa.gov");
  });

  it("returns null (never throws) when NOAA returns an in-band error object", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { message: "No data was found." } })));

    const result = await getPacificWaterTemperature("1770000");
    expect(result).toBeNull();
  });

  it("returns null (never throws) when NOAA returns a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: true }, 400)));

    const result = await getPacificWaterTemperature("1770000");
    expect(result).toBeNull();
  });

  it("returns null (never throws) when the fetch itself rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );

    const result = await getPacificWaterTemperature("1770000");
    expect(result).toBeNull();
  });

  it("caches results for the 30-minute TTL — a second call within the window doesn't re-fetch", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(NOAA_PAGO_PAGO_RESPONSE));
    vi.stubGlobal("fetch", fetchSpy);

    await getPacificWaterTemperature("1770000");
    await getPacificWaterTemperature("1770000");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("GET /climate/pacific-ocean-temp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetWaterTemperatureCacheForTests();
  });

  it("defaults to station 1770000 when station is omitted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(NOAA_PAGO_PAGO_RESPONSE)));

    const app = buildTestApp();
    const res = await app.request("/climate/pacific-ocean-temp");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { station_id: string };
    expect(body.station_id).toBe("1770000");
  });

  it("returns 400 for an invalid station", async () => {
    const app = buildTestApp();
    const res = await app.request("/climate/pacific-ocean-temp?station=0000000");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("returns 200 with water temperature data and Cache-Control for a valid station", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(NOAA_PAGO_PAGO_RESPONSE)));

    const app = buildTestApp();
    const res = await app.request("/climate/pacific-ocean-temp?station=1770000");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=1800");

    const body = (await res.json()) as { value: number; nation: string };
    expect(body.value).toBe(26.4);
    expect(body.nation).toBe("American Samoa");
  });

  it("returns 503 (not 500) when NOAA CO-OPS is unavailable for a valid station", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );

    const app = buildTestApp();
    const res = await app.request("/climate/pacific-ocean-temp?station=1770000");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("service_unavailable");
  });
});
