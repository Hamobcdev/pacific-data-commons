import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pacificPurseSeineRoute } from "../routes/fisheries/pacific-purse-seine.js";
import { getPurseSeineCatch, __resetFisheriesCacheForTests, THREDDS_WCPFC_URL } from "../services/pacificFisheriesPurseSeineService.js";
import { paidRoutes } from "../routeSchemas.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

// 4 months (indices 624–627) of a 628-entry time array, "days since
// 1967-12-01" (verified via plain date arithmetic, not guessed): index
// 624 = day 19373 => 2020-12-15 (year 2020, a boundary entry that must
// NOT be included in a 2021 query); indices 625–627 = days 19404/19555/
// 19724 => 2021-01-15/2021-06-15/2021-12-01 (year 2021, 3 matching
// months). Indices 0–623 are filler day 0.0 (year 1967).
const TIME_ASCII = [
  "Dataset {",
  "    Float64 time[time = 628];",
  "} PCCOS/WCPFC/WCPFC_S_PUBLIC_BY_1x1_MM.nc;",
  "---------------------------------------------",
  "time[628]",
  `${"0.0, ".repeat(624)}19373.0, 19404.0, 19555.0, 19724.0`,
].join("\n");

function gridAscii(varName: string, timeCount: number, values: number[][]): string {
  const lines = [
    "Dataset {",
    "    Grid {",
    "     ARRAY:",
    `        Float64 ${varName}[time = ${timeCount}][latitude = 100][longitude = 124];`,
    "     MAPS:",
    `        Float64 time[time = ${timeCount}];`,
    "        Float64 latitude[latitude = 100];",
    "        Float64 longitude[longitude = 124];",
    `    } ${varName};`,
    "} PCCOS/WCPFC/WCPFC_S_PUBLIC_BY_1x1_MM.nc;",
    "---------------------------------------------",
    `${varName}.${varName}[${timeCount}][100][124]`,
  ];
  for (let t = 0; t < timeCount; t++) {
    for (let lat = 0; lat < 100; lat++) {
      const row = values[t]?.[lat];
      lines.push(`[${t}][${lat}], ${row !== undefined ? `${row}${", NaN".repeat(123)}` : "NaN".concat(", NaN".repeat(123))}`);
    }
  }
  lines.push(`time[${timeCount}]`, Array.from({ length: timeCount }, () => "0.0").join(", "));
  return lines.join("\n");
}

/** One non-NaN cell (lat 0) per time step, value `perMonth`; everything else NaN. */
function singleCellGrid(varName: string, timeCount: number, perMonth: number): string {
  return gridAscii(
    varName,
    timeCount,
    Array.from({ length: timeCount }, () => [perMonth]),
  );
}

function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = {} as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });

  app.route("/", pacificPurseSeineRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

/** Stubs fetch so: time -> TIME_ASCII; any skj_c_* -> 10mt/month; any yft_c_* -> 20mt/month; any bet_c_* -> 30mt/month; indices 625–627 (the 3 months found for year 2021). */
function stubFetchForYear2021(perSpeciesMt: Record<string, number>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith(".ascii?time")) return textResponse(TIME_ASCII);
    for (const [species, mt] of Object.entries(perSpeciesMt)) {
      if (url.includes(`${species}_c_`)) {
        // 625:1:627 => 3 time steps in the slice.
        return textResponse(singleCellGrid(`${species}_c_x`, 3, mt));
      }
    }
    return textResponse("", 404);
  });
}

describe("getPurseSeineCatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetFisheriesCacheForTests();
  });

  it("sums all 5 gear-mode variables across the full grid for the requested year", async () => {
    // Each gear variable contributes 10mt/month at one cell, 3 months in
    // range => 5 gear vars * 3 months * 10mt = 150mt; record_count = 5*3 = 15.
    vi.stubGlobal("fetch", stubFetchForYear2021({ skj: 10 }));

    const result = await getPurseSeineCatch("skj", 2021);

    expect(result).not.toBeNull();
    expect(result?.total_catch_mt).toBe(150);
    expect(result?.record_count).toBe(15);
  });

  it("returns the correct common_name for each species", async () => {
    vi.stubGlobal("fetch", stubFetchForYear2021({ skj: 1, yft: 1, bet: 1 }));

    expect((await getPurseSeineCatch("skj", 2021))?.common_name).toBe("Skipjack Tuna");
    expect((await getPurseSeineCatch("yft", 2021))?.common_name).toBe("Yellowfin Tuna");
    expect((await getPurseSeineCatch("bet", 2021))?.common_name).toBe("Bigeye Tuna");
  });

  it("includes data_currency: historical in every successful result", async () => {
    vi.stubGlobal("fetch", stubFetchForYear2021({ skj: 1 }));
    const result = await getPurseSeineCatch("skj", 2021);
    expect(result?.data_currency).toBe("historical");
  });

  it("includes the reporting_lag_note in every successful result", async () => {
    vi.stubGlobal("fetch", stubFetchForYear2021({ skj: 1 }));
    const result = await getPurseSeineCatch("skj", 2021);
    expect(result?.reporting_lag_note).toContain("verified 1–2 years after fishing year");
  });

  it("includes the attribution field in every successful result", async () => {
    vi.stubGlobal("fetch", stubFetchForYear2021({ skj: 1 }));
    const result = await getPurseSeineCatch("skj", 2021);
    expect(result?.attribution).toBe(
      "WCPFC Public Domain Aggregated Catch/Effort Data — Purse Seine 1°x1° Monthly. Western and Central Pacific Fisheries Commission. tds.pacificdata.org",
    );
  });

  it("computes year_range_covered from the live time array, not a hardcoded string", async () => {
    vi.stubGlobal("fetch", stubFetchForYear2021({ skj: 1 }));
    const result = await getPurseSeineCatch("skj", 2021);
    // TIME_ASCII's first 624 entries are day 0 (year 1967), last is day
    // 19724 (year 2021) — exercises the real dayOffsetToYear conversion.
    expect(result?.year_range_covered).toBe("1967–2021");
  });

  it("returns unit: metric_tonnes", async () => {
    vi.stubGlobal("fetch", stubFetchForYear2021({ skj: 1 }));
    const result = await getPurseSeineCatch("skj", 2021);
    expect(result?.unit).toBe("metric_tonnes");
  });

  it("returns an honest zero with record_count 0 for a year with no matching time-array entries (not an error)", async () => {
    vi.stubGlobal("fetch", stubFetchForYear2021({ skj: 1 }));
    // TIME_ASCII has no entries for 1999.
    const result = await getPurseSeineCatch("skj", 1999);
    expect(result).not.toBeNull();
    expect(result?.total_catch_mt).toBe(0);
    expect(result?.record_count).toBe(0);
    expect(result?.data_currency).toBe("historical");
  });

  it("excludes NaN (_FillValue) cells from both the sum and record_count", async () => {
    // singleCellGrid already puts NaN in every cell but lat 0 — this test
    // just asserts record_count reflects only the real (non-NaN) cells,
    // not the full 100-lat * 124-lon grid.
    vi.stubGlobal("fetch", stubFetchForYear2021({ skj: 7 }));
    const result = await getPurseSeineCatch("skj", 2021);
    // 5 gear vars * 3 months * 1 non-NaN cell each = 15, not 5*3*12400.
    expect(result?.record_count).toBe(15);
  });

  it("returns null (never throws) when any one of the 5 gear-mode fetches fails — no partial/undercounted sum", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith(".ascii?time")) return textResponse(TIME_ASCII);
      if (url.includes("skj_c_una")) return textResponse("", 500); // one of the 5 fails
      if (url.includes("skj_c_")) return textResponse(singleCellGrid("skj_c_x", 3, 10));
      return textResponse("", 404);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getPurseSeineCatch("skj", 2021);
    expect(result).toBeNull();
  });

  it("returns null (never throws) when the time-array fetch itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => textResponse("", 500)),
    );
    const result = await getPurseSeineCatch("skj", 2021);
    expect(result).toBeNull();
  });

  it("returns null (never throws) when the time-array fetch rejects outright", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const result = await getPurseSeineCatch("skj", 2021);
    expect(result).toBeNull();
  });

  it("caches a species+year result for the 24-hour TTL — a second call doesn't re-fetch", async () => {
    const fetchSpy = stubFetchForYear2021({ skj: 1 });
    vi.stubGlobal("fetch", fetchSpy);

    await getPurseSeineCatch("skj", 2021);
    const callsAfterFirst = fetchSpy.mock.calls.length;
    await getPurseSeineCatch("skj", 2021);

    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it("caches the time-array fetch separately from the per-species result — a different species in the same year reuses it", async () => {
    const fetchSpy = stubFetchForYear2021({ skj: 1, yft: 1 });
    vi.stubGlobal("fetch", fetchSpy);

    await getPurseSeineCatch("skj", 2021);
    const timeFetchCalls = fetchSpy.mock.calls.filter(([input]) => (typeof input === "string" ? input : input.toString()).endsWith(".ascii?time")).length;

    await getPurseSeineCatch("yft", 2021);
    const timeFetchCallsAfter = fetchSpy.mock.calls.filter(([input]) => (typeof input === "string" ? input : input.toString()).endsWith(".ascii?time")).length;

    expect(timeFetchCalls).toBe(1);
    expect(timeFetchCallsAfter).toBe(1); // not re-fetched for the second species
  });

  it("builds the THREDDS grid-slice URL with percent-encoded brackets (literal [ ] 400s on this server)", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith(".ascii?time")) return textResponse(TIME_ASCII);
      expect(url).toContain(THREDDS_WCPFC_URL);
      expect(url).toContain("%5B625:1:627%5D%5B0:1:99%5D%5B0:1:123%5D");
      expect(url).not.toMatch(/[[\]]/); // no literal, unencoded brackets
      return textResponse(singleCellGrid("skj_c_x", 3, 1));
    });
    vi.stubGlobal("fetch", fetchSpy);

    await getPurseSeineCatch("skj", 2021);
    expect(fetchSpy).toHaveBeenCalled();
  });
});

describe("GET /fisheries/pacific-purse-seine", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetFisheriesCacheForTests();
  });

  it("defaults to species skj when species is omitted", async () => {
    vi.stubGlobal("fetch", stubFetchForYear2021({ skj: 1 }));
    const app = buildTestApp();
    const res = await app.request("/fisheries/pacific-purse-seine?year=2021");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { species_code: string };
    expect(body.species_code).toBe("skj");
  });

  it("accepts species=yft", async () => {
    vi.stubGlobal("fetch", stubFetchForYear2021({ yft: 1 }));
    const app = buildTestApp();
    const res = await app.request("/fisheries/pacific-purse-seine?species=yft&year=2021");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { species_code: string };
    expect(body.species_code).toBe("yft");
  });

  it("accepts species=bet", async () => {
    vi.stubGlobal("fetch", stubFetchForYear2021({ bet: 1 }));
    const app = buildTestApp();
    const res = await app.request("/fisheries/pacific-purse-seine?species=bet&year=2021");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { species_code: string };
    expect(body.species_code).toBe("bet");
  });

  it("returns 400 for species=alb with an explanation, not a fabricated zero", async () => {
    const app = buildTestApp();
    const res = await app.request("/fisheries/pacific-purse-seine?species=alb&year=2021");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("invalid_request");
    expect(body.message).toContain("Albacore");
    expect(body.message).toContain("longline");
  });

  it("returns 400 for an unrecognised species", async () => {
    const app = buildTestApp();
    const res = await app.request("/fisheries/pacific-purse-seine?species=mackerel&year=2021");
    expect(res.status).toBe(400);
  });

  it("returns 400 when year is missing", async () => {
    const app = buildTestApp();
    const res = await app.request("/fisheries/pacific-purse-seine");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("required");
  });

  it("returns 400 for a non-4-digit year", async () => {
    const app = buildTestApp();
    const res = await app.request("/fisheries/pacific-purse-seine?year=99");
    expect(res.status).toBe(400);
  });

  it("returns 400 for a year outside the dataset's covered range", async () => {
    const app = buildTestApp();
    const res = await app.request("/fisheries/pacific-purse-seine?year=2099");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("between");
  });

  it("returns 200 with the purse seine summary and Cache-Control for a valid request", async () => {
    vi.stubGlobal("fetch", stubFetchForYear2021({ skj: 1 }));
    const app = buildTestApp();
    const res = await app.request("/fisheries/pacific-purse-seine?species=skj&year=2021");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");

    const body = (await res.json()) as { year_filter: number; data_currency: string; reporting_lag_note: string; attribution: string };
    expect(body.year_filter).toBe(2021);
    expect(body.data_currency).toBe("historical");
    expect(body.reporting_lag_note).toBeTruthy();
    expect(body.attribution).toBeTruthy();
  });

  it("returns 503 (not 500) when THREDDS is unavailable for a valid request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const app = buildTestApp();
    const res = await app.request("/fisheries/pacific-purse-seine?species=skj&year=2021");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("service_unavailable");
  });
});

describe("routeSchemas: /fisheries/pacific-purse-seine payment gate", () => {
  it("is registered as a paid route with the expected Tier 2 price", () => {
    const route = paidRoutes.find((r) => r.path === "/fisheries/pacific-purse-seine" && r.method === "GET");
    expect(route).toBeDefined();
    expect(route?.priceUsdc).toBe(0.05);
    expect(route?.payToAddress).toBeTruthy();
  });
});
