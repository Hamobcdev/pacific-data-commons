import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pacificRemittanceRoute } from "../routes/finance/remittance-corridors.js";
import { __resetRemittanceCacheForTests, CORRIDORS, CRYPTO_TOKENS, BENCHMARK_SEND_AMOUNT_USD } from "../services/pacificRemittanceService.js";
import { __resetFxRateCacheForTests } from "../services/fxRateService.js";
import { paidRoutes } from "../routeSchemas.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const JSDELIVR_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
const WORLD_BANK_URL = "https://remittanceprices.worldbank.org/api/remittancepricesapi/json";
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";

// USD-base rates covering every send/receive currency the 9 corridors need.
const FX_RATES = { usd: 1, aud: 1.44, nzd: 1.78, wst: 2.74, fjd: 2.24, pgk: 4.47, top: 2.39 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** All World Bank calls return 403 (the confirmed-live real-world outcome) unless overridden. */
function defaultFetchMock() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === JSDELIVR_URL) return jsonResponse({ date: "2026-10-04", usd: FX_RATES });
    if (url.startsWith(COINGECKO_URL)) return jsonResponse({ algorand: { usd: 0.13 } });
    if (url.startsWith(WORLD_BANK_URL)) return jsonResponse({}, 403);
    throw new Error(`unexpected fetch to ${url}`);
  });
}

function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = {} as Env;
  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });
  app.route("/", pacificRemittanceRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("getRemittanceSnapshot / GET /finance/remittance-corridors", () => {
  beforeEach(() => {
    __resetRemittanceCacheForTests();
    __resetFxRateCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetRemittanceCacheForTests();
    __resetFxRateCacheForTests();
  });

  it("returns all 9 curated corridors by default", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { corridors: Array<{ corridor_id: string }> };
    expect(body.corridors).toHaveLength(9);
    expect(CORRIDORS.length).toBe(9);
    expect(body.corridors.map((c) => c.corridor_id).sort()).toEqual(CORRIDORS.map((c) => c.corridor_id).sort());
  });

  it("?corridor=AUS_WST returns exactly one corridor", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors?corridor=AUS_WST");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { corridors: Array<{ corridor_id: string }> };
    expect(body.corridors).toHaveLength(1);
    expect(body.corridors[0]?.corridor_id).toBe("AUS_WST");
  });

  it("returns 400 for an unknown corridor", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors?corridor=GBR_WST");
    expect(res.status).toBe(400);
  });

  it("?token=XRP returns only the XRP crypto rail on every corridor", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors?token=XRP");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { corridors: Array<{ crypto_rails: Array<{ token: string }> }> };
    for (const corridor of body.corridors) {
      expect(corridor.crypto_rails).toHaveLength(1);
      expect(corridor.crypto_rails[0]?.token).toBe("XRP");
    }
  });

  it("returns 400 for an unknown token", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors?token=DOGE");
    expect(res.status).toBe(400);
  });

  it("populates live_fx_rate from the FX service for each corridor (AUD->WST, NZD->TOP, USD->PGK)", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors");
    const body = (await res.json()) as { corridors: Array<{ corridor_id: string; live_fx_rate: { rate: number | null; pair: string } }> };

    const ausWst = body.corridors.find((c) => c.corridor_id === "AUS_WST")!;
    expect(ausWst.live_fx_rate.pair).toBe("AUD_to_WST");
    expect(ausWst.live_fx_rate.rate).toBeCloseTo(2.74 / 1.44, 4);

    const nzlTop = body.corridors.find((c) => c.corridor_id === "NZL_TOP")!;
    expect(nzlTop.live_fx_rate.rate).toBeCloseTo(2.39 / 1.78, 4);

    const usaPgk = body.corridors.find((c) => c.corridor_id === "USA_PGK")!;
    expect(usaPgk.live_fx_rate.rate).toBeCloseTo(4.47, 4); // USD base, direct rate
  });

  it("falls back to STATIC_CORRIDOR_COSTS (Q4-2024) for every corridor when the live World Bank fetch fails (the confirmed reality today) — traditional_rails is populated, not null", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors");
    const body = (await res.json()) as {
      corridors: Array<{
        corridor_id: string;
        traditional_rails: { average_cost_pct: number; cheapest_cost_pct: number; cheapest_provider: string; provider_count: number | null; data_source: string; live_data: boolean; static_fallback: boolean } | null;
        traditional_rails_note: string | null;
        potential_saving_pct: number | null;
      }>;
    };

    const expected: Record<string, { avg: number; cheapest: number; provider: string }> = {
      AUS_WST: { avg: 6.8, cheapest: 4.2, provider: "Western Union" },
      AUS_FJD: { avg: 5.9, cheapest: 3.8, provider: "Western Union" },
      AUS_PGK: { avg: 8.1, cheapest: 6.2, provider: "ANZ" },
      NZL_WST: { avg: 7.2, cheapest: 5.1, provider: "Western Union" },
      NZL_FJD: { avg: 6.4, cheapest: 4.6, provider: "Western Union" },
      NZL_TOP: { avg: 7.8, cheapest: 5.4, provider: "Western Union" },
      USA_WST: { avg: 5.9, cheapest: 3.2, provider: "Remitly" },
      USA_FJD: { avg: 5.4, cheapest: 3.0, provider: "Remitly" },
      USA_PGK: { avg: 8.6, cheapest: 6.8, provider: "Western Union" },
    };

    for (const corridor of body.corridors) {
      const exp = expected[corridor.corridor_id]!;
      expect(corridor.traditional_rails).not.toBeNull();
      expect(corridor.traditional_rails?.average_cost_pct).toBe(exp.avg);
      expect(corridor.traditional_rails?.cheapest_cost_pct).toBe(exp.cheapest);
      expect(corridor.traditional_rails?.cheapest_provider).toBe(exp.provider);
      expect(corridor.traditional_rails?.data_source).toBe("World Bank RPW Q4-2024");
      expect(corridor.traditional_rails?.live_data).toBe(false);
      expect(corridor.traditional_rails?.static_fallback).toBe(true);
      expect(corridor.traditional_rails?.provider_count).toBeNull(); // never backfilled with a guess
      expect(corridor.traditional_rails_note).toBeNull(); // static fallback succeeded — nothing to explain
      expect(corridor.potential_saving_pct).not.toBeNull();
      expect(corridor.potential_saving_pct!).toBeCloseTo(exp.avg - 0.02, 1);
    }
  });

  it("prefers live World Bank data over the static fallback when a live fetch succeeds, while other corridors still use static", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === JSDELIVR_URL) return jsonResponse({ date: "2026-10-04", usd: FX_RATES });
        if (url.startsWith(COINGECKO_URL)) return jsonResponse({ algorand: { usd: 0.13 } });
        if (url.includes("iso3=AUS_WSM")) {
          // Deliberately different from AUS_WST's static baseline (6.8) so a
          // pass here can only mean the LIVE value was actually used.
          return jsonResponse({ corridors: [{ cc1_average: 15.0, cheapest_provider_name: "Example Provider", cheapest_cost_pct: 14.0, no_institutions: 4 }] });
        }
        if (url.startsWith(WORLD_BANK_URL)) return jsonResponse({}, 403);
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors");
    const body = (await res.json()) as {
      corridors: Array<{ corridor_id: string; traditional_rails: { average_cost_pct: number; provider_count: number | null; cheapest_provider: string | null; data_source: string; live_data: boolean; static_fallback: boolean } | null }>;
    };

    const ausWst = body.corridors.find((c) => c.corridor_id === "AUS_WST")!;
    expect(ausWst.traditional_rails?.average_cost_pct).toBe(15.0);
    expect(ausWst.traditional_rails?.provider_count).toBe(4);
    expect(ausWst.traditional_rails?.cheapest_provider).toBe("Example Provider");
    expect(ausWst.traditional_rails?.data_source).toBe("World Bank RPW");
    expect(ausWst.traditional_rails?.live_data).toBe(true);
    expect(ausWst.traditional_rails?.static_fallback).toBe(false);

    // Every other corridor still falls back to its own static Q4-2024 figure.
    const ausFjd = body.corridors.find((c) => c.corridor_id === "AUS_FJD")!;
    expect(ausFjd.traditional_rails?.average_cost_pct).toBe(5.9);
    expect(ausFjd.traditional_rails?.data_source).toBe("World Bank RPW Q4-2024");
    expect(ausFjd.traditional_rails?.static_fallback).toBe(true);
  });

  it("?min_saving_pct= filters using the static-fallback-derived potential_saving_pct now that it's always populated", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    // Static savings range ~5.38% (USA_FJD) to ~8.58% (USA_PGK) — a 6.0
    // threshold cleanly splits the 9 corridors.
    const res = await app.request("/finance/remittance-corridors?min_saving_pct=6.0");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { corridors: Array<{ corridor_id: string }>; meta: { corridors_returned: number } };
    expect(body.corridors.map((c) => c.corridor_id).sort()).toEqual(["AUS_PGK", "AUS_WST", "NZL_FJD", "NZL_TOP", "NZL_WST", "USA_PGK"].sort());
    expect(body.meta.corridors_returned).toBe(6);
  });

  it("?min_saving_pct= correctly includes/excludes corridors based on live (not static) data when a live fetch succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === JSDELIVR_URL) return jsonResponse({ date: "2026-10-04", usd: FX_RATES });
        if (url.startsWith(COINGECKO_URL)) return jsonResponse({ algorand: { usd: 0.13 } });
        if (url.includes("iso3=AUS_WSM")) {
          // Live value far above every static corridor's own saving — only
          // this corridor should clear a 10.0 threshold.
          return jsonResponse({ corridors: [{ cc1_average: 15.0, no_institutions: 4 }] });
        }
        if (url.startsWith(WORLD_BANK_URL)) return jsonResponse({}, 403);
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors?min_saving_pct=10.0");
    const body = (await res.json()) as { corridors: Array<{ corridor_id: string }> };
    expect(body.corridors.map((c) => c.corridor_id)).toEqual(["AUS_WST"]);
  });

  it("computes crypto rail costs correctly at the $200 benchmark for all 3 tokens", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors?corridor=AUS_WST");
    const body = (await res.json()) as {
      corridors: Array<{ crypto_rails: Array<{ token: string; network_fee_usd: number; fx_spread_pct_estimate: number; total_estimated_cost_pct: number; total_estimated_cost_usd: number }> }>;
    };
    const rails = body.corridors[0]!.crypto_rails;
    expect(rails).toHaveLength(3);
    expect(CRYPTO_TOKENS.length).toBe(3);

    const xrp = rails.find((r) => r.token === "XRP")!;
    expect(xrp.network_fee_usd).toBe(0.0001);
    expect(xrp.fx_spread_pct_estimate).toBe(0.02);
    // 0.02% of $200 = $0.04, plus the $0.0001 fee = $0.0401 (0.02005%, rounded to 0.0201 at the service's own 4-decimal rounding).
    expect(xrp.total_estimated_cost_usd).toBeCloseTo(0.0401, 4);
    expect(xrp.total_estimated_cost_pct).toBe(0.0201);

    const algo = rails.find((r) => r.token === "ALGO")!;
    expect(algo.network_fee_usd).toBe(0.001);
    expect(algo.total_estimated_cost_usd).toBeCloseTo((algo.fx_spread_pct_estimate / 100) * BENCHMARK_SEND_AMOUNT_USD + 0.001, 4);
  });

  it("includes on_off_ramp_note and not_financial_advice: true on every crypto rail", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors");
    const body = (await res.json()) as { corridors: Array<{ crypto_rails: Array<{ on_off_ramp_note: string; not_financial_advice: boolean }> }> };
    for (const corridor of body.corridors) {
      for (const rail of corridor.crypto_rails) {
        expect(rail.on_off_ramp_note).toContain("Network fees only");
        expect(rail.not_financial_advice).toBe(true);
      }
    }
  });

  it("includes not_financial_advice: true at both the corridor level and the meta level", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors");
    const body = (await res.json()) as { corridors: Array<{ not_financial_advice: boolean }>; meta: { not_financial_advice: boolean } };
    for (const corridor of body.corridors) {
      expect(corridor.not_financial_advice).toBe(true);
    }
    expect(body.meta.not_financial_advice).toBe(true);
  });

  it("has a static Q4-2024 fallback entry for all 9 curated corridors, with no corridor left uncovered", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors");
    const body = (await res.json()) as { corridors: Array<{ corridor_id: string; traditional_rails: unknown; traditional_rails_note: string | null }> };
    expect(body.corridors).toHaveLength(9);
    for (const corridor of body.corridors) {
      // Every one of the 9 curated corridors has a static fallback entry
      // today, so none should ever hit the defensive "no data at all" path.
      expect(corridor.traditional_rails).not.toBeNull();
      expect(corridor.traditional_rails_note).toBeNull();
    }
  });

  it("always includes live_data and static_fallback booleans on traditional_rails", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors");
    const body = (await res.json()) as { corridors: Array<{ traditional_rails: { live_data: boolean; static_fallback: boolean } | null }> };
    for (const corridor of body.corridors) {
      expect(typeof corridor.traditional_rails?.live_data).toBe("boolean");
      expect(typeof corridor.traditional_rails?.static_fallback).toBe("boolean");
      // Exactly one of the two should be true — never both, never neither.
      expect(corridor.traditional_rails?.live_data).not.toBe(corridor.traditional_rails?.static_fallback);
    }
  });

  it("includes complete meta fields", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors");
    const body = (await res.json()) as {
      meta: { benchmark_send_amount_usd: number; corridors_returned: number; note: string; not_financial_advice: boolean; data_sources: string[]; generated_at: string };
    };
    expect(body.meta.benchmark_send_amount_usd).toBe(200);
    expect(body.meta.corridors_returned).toBe(9);
    expect(body.meta.note).toContain("network fees only");
    expect(body.meta.data_sources.length).toBeGreaterThan(0);
    expect(body.meta.generated_at).toBeTruthy();
  });

  it("returns 200 with Cache-Control for a valid request", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
  });
});

describe("routeSchemas: /finance/remittance-corridors payment gate", () => {
  it("is registered as a paid route with the expected Tier 1 price", () => {
    const route = paidRoutes.find((r) => r.path === "/finance/remittance-corridors" && r.method === "GET");
    expect(route).toBeDefined();
    expect(route?.priceUsdc).toBe(0.01);
    expect(route?.payToAddress).toBeTruthy();
  });
});
