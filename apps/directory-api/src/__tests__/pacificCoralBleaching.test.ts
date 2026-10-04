import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pacificCoralBleachingRoute } from "../routes/climate/pacific-coral-bleaching.js";
import { getCoralBleaching, __resetCoralBleachingCacheForTests, ERDDAP_CORAL_BASE } from "../services/pacificCoralBleachingService.js";
import { paidRoutes } from "../routeSchemas.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

function coralCsv(rows: Array<[string, number, number, number | "NaN", number | "NaN"]>): string {
  const lines = ["time,latitude,longitude,CRW_BAA,CRW_DHW", "UTC,degrees_north,degrees_east,1,Celsius weeks"];
  for (const [time, lat, lon, baa, dhw] of rows) {
    lines.push(`${time},${lat},${lon},${baa},${dhw}`);
  }
  return lines.join("\n");
}

// Exact centre match (distance 0) — Watch level, DHW 0.5.
const ROW_CENTRE = ["2026-10-02T12:00:00Z", -13.759, -172.104, 1, 0.5] as [string, number, number, number, number];
// Elsewhere in the region — Alert Level 1 (the max in the region), DHW 2.0.
const ROW_FAR = ["2026-10-02T12:00:00Z", -14.0, -172.5, 3, 2.0] as [string, number, number, number, number];
// Land/missing cell — must be excluded from every aggregate.
const ROW_LAND = ["2026-10-02T12:00:00Z", -15.0, -174.0, "NaN", "NaN"] as [string, number, number, "NaN", "NaN"];

function defaultFetchMock() {
  return vi.fn(async () => textResponse(coralCsv([ROW_CENTRE, ROW_FAR, ROW_LAND])));
}

function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = {} as Env;
  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });
  app.route("/", pacificCoralBleachingRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("getCoralBleaching", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetCoralBleachingCacheForTests();
  });

  it("returns the expected shape and computed values for a successful request", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());

    const result = await getCoralBleaching(-13.759, -172.104, 2.0);

    expect(result).not.toBeNull();
    expect(result?.bleaching_alert_level).toBe(1);
    expect(result?.bleaching_alert_label).toBe("Watch");
    expect(result?.max_alert_in_region).toBe(3); // from ROW_FAR, not the nearest cell
    expect(result?.mean_dhw).toBe(1.25); // mean(0.5, 2.0) — ROW_LAND excluded
    expect(result?.region_sample_size).toBe(2); // ROW_CENTRE + ROW_FAR only
  });

  it("echoes back the requested centre and radius, not a grid-snapped value", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const result = await getCoralBleaching(-13.759, -172.104, 2.0);
    expect(result?.centre_lat).toBe(-13.759);
    expect(result?.centre_lon).toBe(-172.104);
    expect(result?.radius_deg).toBe(2.0);
  });

  it("sets observation_date from the nearest row's time column", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const result = await getCoralBleaching(-13.759, -172.104, 2.0);
    expect(result?.observation_date).toBe("2026-10-02");
  });

  it("always sets data_currency to daily", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const result = await getCoralBleaching(-13.759, -172.104, 2.0);
    expect(result?.data_currency).toBe("daily");
  });

  it("includes the exact reporting_lag_note", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const result = await getCoralBleaching(-13.759, -172.104, 2.0);
    expect(result?.reporting_lag_note).toBe("NOAA CoralTemp updates daily with ~24h processing lag");
  });

  it("includes the exact attribution and attribution_url", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const result = await getCoralBleaching(-13.759, -172.104, 2.0);
    expect(result?.attribution).toBe("NOAA Coral Reef Watch CoralTemp 5km Daily Satellite Monitoring");
    expect(result?.attribution_url).toBe("https://coralreefwatch.noaa.gov/");
  });

  it.each([
    [0, "No Stress"],
    [1, "Watch"],
    [2, "Warning"],
    [3, "Alert Level 1"],
    [4, "Alert Level 2"],
  ])("maps alert level %i to label %s", async (level, label) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => textResponse(coralCsv([["2026-10-02T12:00:00Z", -13.759, -172.104, level as number, 0.1]]))),
    );
    const result = await getCoralBleaching(-13.759, -172.104, 2.0);
    expect(result?.bleaching_alert_level).toBe(level);
    expect(result?.bleaching_alert_label).toBe(label);
  });

  it("falls back to the nearest VALID cell when the exact centre cell is land/missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        textResponse(
          coralCsv([
            ["2026-10-02T12:00:00Z", -13.759, -172.104, "NaN", "NaN"], // exact centre — land
            ["2026-10-02T12:00:00Z", -13.76, -172.1, 2, 1.0], // nearest real cell
          ]),
        ),
      ),
    );
    const result = await getCoralBleaching(-13.759, -172.104, 2.0);
    expect(result).not.toBeNull();
    expect(result?.bleaching_alert_level).toBe(2);
  });

  it("returns null (never throws) when the upstream fetch returns a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => textResponse("", 500)),
    );
    expect(await getCoralBleaching(-13.759, -172.104, 2.0)).toBeNull();
  });

  it("returns null (never throws) when the fetch rejects outright", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    expect(await getCoralBleaching(-13.759, -172.104, 2.0)).toBeNull();
  });

  it("returns null (never throws) when the CSV has zero data rows", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => textResponse("time,latitude,longitude,CRW_BAA,CRW_DHW\nUTC,degrees_north,degrees_east,1,Celsius weeks")));
    expect(await getCoralBleaching(-13.759, -172.104, 2.0)).toBeNull();
  });

  it("returns null (never throws) when every cell in the region is land/missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => textResponse(coralCsv([ROW_LAND]))));
    expect(await getCoralBleaching(-13.759, -172.104, 2.0)).toBeNull();
  });

  it("caches a result for the 24-hour TTL — a second call with the same params doesn't re-fetch", async () => {
    const fetchSpy = defaultFetchMock();
    vi.stubGlobal("fetch", fetchSpy);

    await getCoralBleaching(-13.759, -172.104, 2.0);
    const callsAfterFirst = fetchSpy.mock.calls.length;
    await getCoralBleaching(-13.759, -172.104, 2.0);

    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it("caches different params separately — a different centre re-fetches", async () => {
    const fetchSpy = defaultFetchMock();
    vi.stubGlobal("fetch", fetchSpy);

    await getCoralBleaching(-13.759, -172.104, 2.0);
    await getCoralBleaching(0, 0, 2.0);

    expect(fetchSpy.mock.calls.length).toBe(2);
  });

  it("builds the ERDDAP URL with (last), percent-encoded brackets, and both variables", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain(ERDDAP_CORAL_BASE);
      expect(url).toContain("CRW_BAA%5B(last)%5D%5B(-15.759):(-11.759)%5D%5B(-174.104):(-170.104)%5D");
      expect(url).toContain("CRW_DHW%5B(last)%5D%5B(-15.759):(-11.759)%5D%5B(-174.104):(-170.104)%5D");
      expect(url).not.toMatch(/[[\]]/);
      return textResponse(coralCsv([ROW_CENTRE]));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getCoralBleaching(-13.759, -172.104, 2.0);
    expect(result).not.toBeNull();
  });

  it("clamps the bounding box to valid lat/lon ranges near the poles", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain("%5B(85):(90)%5D"); // lat 89, radius 4 -> 85:93, max clamped to 90
      return textResponse(coralCsv([["2026-10-02T12:00:00Z", 89, 0, 0, 0]]));
    });
    vi.stubGlobal("fetch", fetchSpy);

    await getCoralBleaching(89, 0, 4);
  });
});

describe("GET /climate/coral-bleaching", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetCoralBleachingCacheForTests();
  });

  it("defaults to Samoa coordinates when lat/lon/radius_deg are omitted", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/climate/coral-bleaching");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { centre_lat: number; centre_lon: number; radius_deg: number };
    expect(body.centre_lat).toBe(-13.759);
    expect(body.centre_lon).toBe(-172.104);
    expect(body.radius_deg).toBe(2.0);
  });

  it("accepts custom lat/lon/radius_deg and reflects them in the response", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/climate/coral-bleaching?lat=-17.5&lon=177.0&radius_deg=1.5");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { centre_lat: number; centre_lon: number; radius_deg: number };
    expect(body.centre_lat).toBe(-17.5);
    expect(body.centre_lon).toBe(177.0);
    expect(body.radius_deg).toBe(1.5);
  });

  it("returns 400 for lat above 90", async () => {
    const app = buildTestApp();
    const res = await app.request("/climate/coral-bleaching?lat=95");
    expect(res.status).toBe(400);
  });

  it("returns 400 for lat below -90", async () => {
    const app = buildTestApp();
    const res = await app.request("/climate/coral-bleaching?lat=-95");
    expect(res.status).toBe(400);
  });

  it("returns 400 for lon out of range", async () => {
    const app = buildTestApp();
    const res = await app.request("/climate/coral-bleaching?lon=185");
    expect(res.status).toBe(400);
  });

  it("returns 400 for radius_deg below 0.1", async () => {
    const app = buildTestApp();
    const res = await app.request("/climate/coral-bleaching?radius_deg=0.05");
    expect(res.status).toBe(400);
  });

  it("returns 400 for radius_deg above 10", async () => {
    const app = buildTestApp();
    const res = await app.request("/climate/coral-bleaching?radius_deg=15");
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-numeric lat", async () => {
    const app = buildTestApp();
    const res = await app.request("/climate/coral-bleaching?lat=not-a-number");
    expect(res.status).toBe(400);
  });

  it("returns 200 with Cache-Control for a valid request", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/climate/coral-bleaching");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
  });

  it("returns 502 (not 500) when the upstream ERDDAP server is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const app = buildTestApp();
    const res = await app.request("/climate/coral-bleaching");
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("bad_gateway");
  });
});

describe("routeSchemas: /climate/coral-bleaching payment gate", () => {
  it("is registered as a paid route with the expected Tier 2 price", () => {
    const route = paidRoutes.find((r) => r.path === "/climate/coral-bleaching" && r.method === "GET");
    expect(route).toBeDefined();
    expect(route?.priceUsdc).toBe(0.05);
    expect(route?.payToAddress).toBeTruthy();
  });
});
