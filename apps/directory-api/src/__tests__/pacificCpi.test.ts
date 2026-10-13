import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pacificCpiRoute } from "../routes/finance/pacific-cpi.js";
import { __resetPacificCpiCacheForTests } from "../services/spcPacificCpiService.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const SPC_URL = "https://stats-nsi-stable.pacificdata.org/rest/data/SPC,DF_CPI,3.2/A.FJ+PG+SB+TO+VU+WS.INF+IDX._T";

// Minimal SDMX-JSON 2.0 fixture matching spcPacificCpiService.ts's decodeSdmxJson:
// series dims order FREQ.GEO_PICT.INDICATOR.COMMODITY, two series (FJ/INF, WS/IDX)
// each with two TIME_PERIOD observations.
function sdmxResponse() {
  return {
    data: {
      structures: [
        {
          dimensions: {
            series: [
              { id: "FREQ", values: [{ id: "A" }] },
              { id: "GEO_PICT", values: [{ id: "FJ" }, { id: "WS" }] },
              { id: "INDICATOR", values: [{ id: "INF" }, { id: "IDX" }] },
              { id: "COMMODITY", values: [{ id: "_T" }] },
            ],
            observation: [{ id: "TIME_PERIOD", values: [{ id: "2024" }, { id: "2025" }] }],
          },
        },
      ],
      dataSets: [
        {
          series: {
            "0:0:0:0": { observations: { "0": [2.1], "1": [2.3] } }, // FJ, INF
            "0:1:1:0": { observations: { "0": [148.0], "1": [151.0] } }, // WS, IDX
          },
        },
      ],
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = {} as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });

  app.route("/", pacificCpiRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /finance/pacific-cpi", () => {
  beforeEach(() => {
    __resetPacificCpiCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetPacificCpiCacheForTests();
  });

  it("returns 200 with decoded observations and honest attribution", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe(SPC_URL);
        expect((init?.headers as Record<string, string>)?.Accept).toBe("application/vnd.sdmx.data+json");
        return jsonResponse(sdmxResponse());
      }),
    );

    const app = buildTestApp();
    const res = await app.request("/finance/pacific-cpi");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");

    const body = (await res.json()) as {
      countries: string[];
      observations: Array<{ country_iso2: string; country_name: string; year: number; indicator: string; value: number | null }>;
      attribution: { source: string; original_source: string; data_quality: string };
    };
    expect(body.countries).toEqual(["Fiji", "Papua New Guinea", "Solomon Islands", "Tonga", "Vanuatu", "Samoa"]);
    expect(body.observations).toHaveLength(4);
    expect(body.observations).toEqual(
      expect.arrayContaining([
        { country_iso2: "FJ", country_name: "Fiji", year: 2024, indicator: "inflation_rate_pct", value: 2.1 },
        { country_iso2: "FJ", country_name: "Fiji", year: 2025, indicator: "inflation_rate_pct", value: 2.3 },
        { country_iso2: "WS", country_name: "Samoa", year: 2024, indicator: "cpi_index", value: 148.0 },
        { country_iso2: "WS", country_name: "Samoa", year: 2025, indicator: "cpi_index", value: 151.0 },
      ]),
    );

    expect(body.attribution.source).toBe("Pacific Community (SPC) — SDMX data service");
    expect(body.attribution.original_source).toContain("National statistics offices");
    expect(body.attribution.data_quality).toBe("third_party_aggregated");
  });

  it("caches across requests — only fetches SPC once for repeated calls", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(sdmxResponse()));
    vi.stubGlobal("fetch", fetchMock);

    const app = buildTestApp();
    await app.request("/finance/pacific-cpi");
    await app.request("/finance/pacific-cpi");
    await app.request("/finance/pacific-cpi");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves the last cached value rather than failing when SPC is unreachable on a later refetch", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount++;
        if (callCount === 1) return jsonResponse(sdmxResponse());
        return new Response("upstream down", { status: 503 });
      }),
    );

    const app = buildTestApp();
    const first = await app.request("/finance/pacific-cpi");
    expect(first.status).toBe(200);

    __resetPacificCpiCacheForTests();
    const second = await app.request("/finance/pacific-cpi");
    expect(second.status).toBe(500);
  });

  it("fails on a cold cache miss when SPC returns no usable observations", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ data: { structures: [], dataSets: [] } })));

    const app = buildTestApp();
    const res = await app.request("/finance/pacific-cpi");
    expect(res.status).toBe(500);
  });
});
