import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pacificOceanForecastRoute } from "../routes/climate/pacific-ocean-forecast.js";
import { getPacificOceanForecast, __resetOceanForecastCacheForTests, HYCOM_POINTER_URL, HYCOM_THREDDS_BASE } from "../services/pacificOceanForecastService.js";
import { paidRoutes } from "../routeSchemas.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

const SEP = "---------------------------------------------";

function flatArrayAscii(dim: string, values: number[]): string {
  return ["Dataset {", `    Float64 ${dim}[${dim} = ${values.length}];`, "} PCCOS/HYCOM/GLBy0.08_930_FMRC_best_20261004.nc;", SEP, `${dim}[${values.length}]`, values.join(", ")].join(
    "\n",
  );
}

// -30,-25,-10,0,10,25,30 — indices 1..5 fall inside -25..25 (minIdx=1, maxIdx=5).
const LAT_ASCII = flatArrayAscii("lat", [-30, -25, -10, 0, 10, 25, 30]);
// 140,150,170,200,220,230 — indices 1..4 fall inside 150..220 (minIdx=1, maxIdx=4).
const LON_ASCII = flatArrayAscii("lon", [140, 150, 170, 200, 220, 230]);
const TIME_ZERO_ASCII = flatArrayAscii("time", [0.0]);

/** 3 leading index groups (time, depth, lat) before the free lon dimension — water_temp/water_u/water_v's real shape. */
function grid3Ascii(varName: string, lon0: number, lon1: number, lastRowSecond: number | "NaN" = "NaN"): string {
  return [
    "Dataset {",
    "    Grid {",
    "     ARRAY:",
    `        Float32 ${varName}[time = 1][depth = 1][lat = 2][lon = 2];`,
    "     MAPS:",
    "        Float64 time[time = 1];",
    "        Float64 depth[depth = 1];",
    "        Float64 lat[lat = 2];",
    "        Float64 lon[lon = 2];",
    `    } ${varName};`,
    "} PCCOS/HYCOM/GLBy0.08_930_FMRC_best_20261004.nc;",
    SEP,
    `${varName}.${varName}[1][1][2][2]`,
    `[0][0][0], ${lon0}, ${lon1}`,
    `[0][0][1], ${lon0}, ${lastRowSecond}`,
  ].join("\n");
}

/** 2 leading index groups (time, lat) before the free lon dimension — surf_el's real shape (no depth). */
function grid2Ascii(varName: string, lon0: number, lon1: number, lastRowSecond: number | "NaN" = "NaN"): string {
  return [
    "Dataset {",
    "    Grid {",
    "     ARRAY:",
    `        Float32 ${varName}[time = 1][lat = 2][lon = 2];`,
    "     MAPS:",
    "        Float64 time[time = 1];",
    "        Float64 lat[lat = 2];",
    "        Float64 lon[lon = 2];",
    `    } ${varName};`,
    "} PCCOS/HYCOM/GLBy0.08_930_FMRC_best_20261004.nc;",
    SEP,
    `${varName}.${varName}[1][2][2]`,
    `[0][0], ${lon0}, ${lon1}`,
    `[0][1], ${lon0}, ${lastRowSecond}`,
  ].join("\n");
}

// Clean round numbers: water_temp mean = (27+28+27)/3 = 27.333..., rounds to
// 27.33; water_u mean = (0.1+0.1+0.1)/3 = 0.1; water_v mean = 0 exactly ->
// current_speed = sqrt(0.1^2+0^2) = 0.1, current_direction = atan2(0.1,0) = 90°
// (due east, oceanographic "flows toward" convention); surf_el mean =
// (0.2+0.2+0.2)/3 = 0.2.
function defaultFetchMock() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === HYCOM_POINTER_URL) return textResponse("20261004");
    if (url.includes(".ascii?lat")) return textResponse(LAT_ASCII);
    if (url.includes(".ascii?lon")) return textResponse(LON_ASCII);
    if (url.includes(".ascii?time")) return textResponse(TIME_ZERO_ASCII);
    if (url.includes("water_temp")) return textResponse(grid3Ascii("water_temp", 27, 28));
    if (url.includes("water_u")) return textResponse(grid3Ascii("water_u", 0.1, 0.1));
    if (url.includes("water_v")) return textResponse(grid3Ascii("water_v", 0.0, 0.0));
    if (url.includes("surf_el")) return textResponse(grid2Ascii("surf_el", 0.2, 0.2));
    return textResponse("", 404);
  });
}

function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = {} as Env;
  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });
  app.route("/", pacificOceanForecastRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("getPacificOceanForecast", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetOceanForecastCacheForTests();
  });

  it("returns the expected shape and computed values for a successful forecast", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());

    const result = await getPacificOceanForecast();

    expect(result).not.toBeNull();
    expect(result?.surface_temperature_c).toBe(27.33);
    expect(result?.current_speed_ms).toBe(0.1);
    expect(result?.current_direction_deg).toBe(90);
    expect(result?.sea_surface_elevation_m).toBe(0.2);
    expect(result?.region_sample_size).toEqual({ water_temp: 3, water_u: 3, water_v: 3, surf_el: 3 });
  });

  it("sets forecast_reference_date from the pointer file, not the file's own (confirmed-unreliable) internal time units", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const result = await getPacificOceanForecast();
    expect(result?.forecast_reference_date).toBe("2026-10-04");
  });

  it("sets valid_time to noon UTC of the reference date plus time[0]'s hour offset", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const result = await getPacificOceanForecast();
    // time[0] = 0.0 hours in the mock -> valid_time = reference date at 12:00 UTC exactly.
    expect(result?.valid_time).toBe("2026-10-04T12:00:00.000Z");
  });

  it("always sets data_currency to daily-forecast", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const result = await getPacificOceanForecast();
    expect(result?.data_currency).toBe("daily-forecast");
  });

  it("includes the exact model and region description", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const result = await getPacificOceanForecast();
    expect(result?.model).toBe("HYCOM GLBy0.08 Global Ocean Model");
    expect(result?.region).toBe("Pacific Island region (lat -25 to 25, lon 150–220)");
  });

  it("includes the exact attribution string", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const result = await getPacificOceanForecast();
    expect(result?.attribution).toBe(
      "HYCOM Global Ocean Model Forecast via Pacific Data Hub THREDDS (tds.pacificdata.org/thredds). Pacific Community (SPC). Model output — not instrument readings.",
    );
  });

  it("never includes a salinity field — this HYCOM product has no salinity variable", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const result = (await getPacificOceanForecast()) as unknown as Record<string, unknown>;
    expect("salinity_psu" in (result ?? {})).toBe(false);
  });

  it("computes current direction from the mean vector, not an average of per-cell directions (second case: due-north current)", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === HYCOM_POINTER_URL) return textResponse("20261004");
      if (url.includes(".ascii?lat")) return textResponse(LAT_ASCII);
      if (url.includes(".ascii?lon")) return textResponse(LON_ASCII);
      if (url.includes(".ascii?time")) return textResponse(TIME_ZERO_ASCII);
      if (url.includes("water_temp")) return textResponse(grid3Ascii("water_temp", 25, 25));
      if (url.includes("water_u")) return textResponse(grid3Ascii("water_u", 0.0, 0.0));
      if (url.includes("water_v")) return textResponse(grid3Ascii("water_v", 0.2, 0.2));
      if (url.includes("surf_el")) return textResponse(grid2Ascii("surf_el", 0.0, 0.0));
      return textResponse("", 404);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getPacificOceanForecast();
    expect(result?.current_speed_ms).toBe(0.2);
    expect(result?.current_direction_deg).toBe(0); // due north: u=0, v>0
  });

  it("returns null (never throws) when the pointer fetch returns a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === HYCOM_POINTER_URL) return textResponse("", 500);
        return textResponse("", 404);
      }),
    );
    expect(await getPacificOceanForecast()).toBeNull();
  });

  it("returns null (never throws) when the pointer file content is malformed (not 8 digits)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === HYCOM_POINTER_URL) return textResponse("not-a-date");
        return textResponse("", 404);
      }),
    );
    expect(await getPacificOceanForecast()).toBeNull();
  });

  it("returns null (never throws) when the pointer fetch rejects outright", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    expect(await getPacificOceanForecast()).toBeNull();
  });

  it("returns null (never throws) when the lat/lon coordinate fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === HYCOM_POINTER_URL) return textResponse("20261004");
        if (url.includes(".ascii?lat")) return textResponse("", 500);
        return textResponse(LON_ASCII);
      }),
    );
    expect(await getPacificOceanForecast()).toBeNull();
  });

  it("returns null (never throws) when the time[0] fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === HYCOM_POINTER_URL) return textResponse("20261004");
        if (url.includes(".ascii?lat")) return textResponse(LAT_ASCII);
        if (url.includes(".ascii?lon")) return textResponse(LON_ASCII);
        if (url.includes(".ascii?time")) return textResponse("", 500);
        return textResponse("", 404);
      }),
    );
    expect(await getPacificOceanForecast()).toBeNull();
  });

  it("returns null (never throws) when one of the 4 regional-mean fetches fails — no partial result", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === HYCOM_POINTER_URL) return textResponse("20261004");
      if (url.includes(".ascii?lat")) return textResponse(LAT_ASCII);
      if (url.includes(".ascii?lon")) return textResponse(LON_ASCII);
      if (url.includes(".ascii?time")) return textResponse(TIME_ZERO_ASCII);
      if (url.includes("water_temp")) return textResponse(grid3Ascii("water_temp", 27, 28));
      if (url.includes("water_u")) return textResponse("", 500); // this one fails
      if (url.includes("water_v")) return textResponse(grid3Ascii("water_v", 0.0, 0.0));
      if (url.includes("surf_el")) return textResponse(grid2Ascii("surf_el", 0.2, 0.2));
      return textResponse("", 404);
    });
    vi.stubGlobal("fetch", fetchSpy);

    expect(await getPacificOceanForecast()).toBeNull();
  });

  it("returns null (never throws) when a variable's sampled region has zero non-missing cells (all land/masked)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === HYCOM_POINTER_URL) return textResponse("20261004");
        if (url.includes(".ascii?lat")) return textResponse(LAT_ASCII);
        if (url.includes(".ascii?lon")) return textResponse(LON_ASCII);
        if (url.includes(".ascii?time")) return textResponse(TIME_ZERO_ASCII);
        if (url.includes("water_temp")) return textResponse(grid3Ascii("water_temp", NaN, NaN, "NaN"));
        if (url.includes("water_u")) return textResponse(grid3Ascii("water_u", 0.1, 0.1));
        if (url.includes("water_v")) return textResponse(grid3Ascii("water_v", 0.0, 0.0));
        if (url.includes("surf_el")) return textResponse(grid2Ascii("surf_el", 0.2, 0.2));
        return textResponse("", 404);
      }),
    );
    expect(await getPacificOceanForecast()).toBeNull();
  });

  it("caches a result for the 6-hour TTL — a second call doesn't re-fetch", async () => {
    const fetchSpy = defaultFetchMock();
    vi.stubGlobal("fetch", fetchSpy);

    await getPacificOceanForecast();
    const callsAfterFirst = fetchSpy.mock.calls.length;
    await getPacificOceanForecast();

    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it("builds the OPeNDAP grid-slice URL with percent-encoded brackets and the correct stride", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === HYCOM_POINTER_URL) return textResponse("20261004");
      if (url.includes(".ascii?lat")) return textResponse(LAT_ASCII);
      if (url.includes(".ascii?lon")) return textResponse(LON_ASCII);
      if (url.includes(".ascii?time")) return textResponse(TIME_ZERO_ASCII);
      if (url.includes("water_temp")) {
        expect(url).toContain(HYCOM_THREDDS_BASE);
        // latRange minIdx=1,maxIdx=5, stride 10; lonRange minIdx=1,maxIdx=4, stride 10.
        expect(url).toContain("water_temp%5B0:1:0%5D%5B0:1:0%5D%5B1:10:5%5D%5B1:10:4%5D");
        expect(url).not.toMatch(/[[\]]/);
        return textResponse(grid3Ascii("water_temp", 27, 28));
      }
      if (url.includes("water_u")) return textResponse(grid3Ascii("water_u", 0.1, 0.1));
      if (url.includes("water_v")) return textResponse(grid3Ascii("water_v", 0.0, 0.0));
      if (url.includes("surf_el")) return textResponse(grid2Ascii("surf_el", 0.2, 0.2));
      return textResponse("", 404);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getPacificOceanForecast();
    expect(result).not.toBeNull();
  });
});

describe("GET /climate/pacific-ocean-forecast", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetOceanForecastCacheForTests();
  });

  it("returns 200 with the forecast and Cache-Control for a successful request", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/climate/pacific-ocean-forecast");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=21600");

    const body = (await res.json()) as { data_currency: string; forecast_reference_date: string; valid_time: string; attribution: string };
    expect(body.data_currency).toBe("daily-forecast");
    expect(body.forecast_reference_date).toBeTruthy();
    expect(body.valid_time).toBeTruthy();
    expect(body.attribution).toBeTruthy();
  });

  it("returns 502 (not 500) when the pointer fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => textResponse("", 500)),
    );
    const app = buildTestApp();
    const res = await app.request("/climate/pacific-ocean-forecast");
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("bad_gateway");
  });

  it("returns 502 (not 500) when the pointer file content is malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === HYCOM_POINTER_URL) return textResponse("garbage");
        return textResponse("", 404);
      }),
    );
    const app = buildTestApp();
    const res = await app.request("/climate/pacific-ocean-forecast");
    expect(res.status).toBe(502);
  });

  it("returns 502 (not 500) when an OPeNDAP grid fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === HYCOM_POINTER_URL) return textResponse("20261004");
        if (url.includes(".ascii?lat")) return textResponse(LAT_ASCII);
        if (url.includes(".ascii?lon")) return textResponse(LON_ASCII);
        if (url.includes(".ascii?time")) return textResponse(TIME_ZERO_ASCII);
        return textResponse("", 500); // all 4 variable fetches fail
      }),
    );
    const app = buildTestApp();
    const res = await app.request("/climate/pacific-ocean-forecast");
    expect(res.status).toBe(502);
  });

  it("takes no query parameters — the same request shape always succeeds or fails the same way", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res1 = await app.request("/climate/pacific-ocean-forecast");
    const res2 = await app.request("/climate/pacific-ocean-forecast?ignored=true");
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });
});

describe("routeSchemas: /climate/pacific-ocean-forecast payment gate", () => {
  it("is registered as a paid route with the expected Tier 2 price", () => {
    const route = paidRoutes.find((r) => r.path === "/climate/pacific-ocean-forecast" && r.method === "GET");
    expect(route).toBeDefined();
    expect(route?.priceUsdc).toBe(0.05);
    expect(route?.payToAddress).toBeTruthy();
  });
});
