import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pacificPopulationRoute } from "../routes/demographics/pacific-population.js";
import { __resetPacificPopulationCacheForTests } from "../services/worldBankPacificPopulationService.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const WORLD_BANK_URL_PREFIX = "https://api.worldbank.org/v2/country/WSM;FJI;TON;VUT;SLB;PNG/indicator/SP.POP.TOTL?";

function worldBankResponse(observations: Array<{ date: string; value: number | null; iso3: string; name: string }>, lastUpdated = "2026-07-13") {
  return [
    { page: 1, pages: 1, per_page: observations.length, total: observations.length, sourceid: "2", lastupdated: lastUpdated },
    observations.map((o) => ({
      indicator: { id: "SP.POP.TOTL", value: "x" },
      country: { id: o.iso3.slice(0, 2), value: o.name },
      countryiso3code: o.iso3,
      date: o.date,
      value: o.value,
      unit: "",
      obs_status: "",
      decimal: 1,
    })),
  ];
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

  app.route("/", pacificPopulationRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /demographics/pacific-population", () => {
  beforeEach(() => {
    __resetPacificPopulationCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetPacificPopulationCacheForTests();
  });

  it("returns 200 with per-country observations, latest_by_country, and honest attribution", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url.startsWith(WORLD_BANK_URL_PREFIX)).toBe(true);
        return jsonResponse(
          worldBankResponse([
            { date: "2025", value: 933154, iso3: "FJI", name: "Fiji" },
            { date: "2024", value: 924000, iso3: "FJI", name: "Fiji" },
            { date: "2025", value: 222382, iso3: "WSM", name: "Samoa" },
          ]),
        );
      }),
    );

    const app = buildTestApp();
    const res = await app.request("/demographics/pacific-population");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");

    const body = (await res.json()) as {
      countries: string[];
      observations: Array<{ country_iso3: string; year: number; population_total: number | null }>;
      latest_by_country: Record<string, { year: number; population_total: number | null } | null>;
      attribution: { source: string; original_source: string; data_quality: string };
    };
    expect(body.countries).toEqual(["WSM", "FJI", "TON", "VUT", "SLB", "PNG"]);
    expect(body.observations).toHaveLength(3);
    expect(body.latest_by_country.FJI).toEqual({ country_iso3: "FJI", country_name: "Fiji", year: 2025, population_total: 933154 });
    expect(body.latest_by_country.TON).toBeNull();

    expect(body.attribution.source).toBe("World Bank Open Data");
    expect(body.attribution.original_source).toContain("National statistics offices");
    expect(body.attribution.data_quality).toBe("third_party_aggregated");
  });

  it("caches across requests — only fetches World Bank once for repeated calls", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(worldBankResponse([{ date: "2025", value: 1, iso3: "WSM", name: "Samoa" }])));
    vi.stubGlobal("fetch", fetchMock);

    const app = buildTestApp();
    await app.request("/demographics/pacific-population");
    await app.request("/demographics/pacific-population");
    await app.request("/demographics/pacific-population");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves the last cached value rather than failing when World Bank is unreachable on a later refetch", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount++;
        if (callCount === 1) return jsonResponse(worldBankResponse([{ date: "2025", value: 1, iso3: "WSM", name: "Samoa" }]));
        return new Response("upstream down", { status: 503 });
      }),
    );

    const app = buildTestApp();
    const first = await app.request("/demographics/pacific-population");
    expect(first.status).toBe(200);

    __resetPacificPopulationCacheForTests();
    const second = await app.request("/demographics/pacific-population");
    expect(second.status).toBe(500);
  });

  it("rejects an invalid years query param without calling World Bank at all", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const app = buildTestApp();
    const res = await app.request("/demographics/pacific-population?years=0");
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();

    const res2 = await app.request("/demographics/pacific-population?years=not-a-number");
    expect(res2.status).toBe(400);
  });
});
