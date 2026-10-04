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

  it("sets traditional_rails: null with an explanatory traditional_rails_note when World Bank RPW has no data (the confirmed-live reality for every corridor today)", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors");
    const body = (await res.json()) as { corridors: Array<{ traditional_rails: unknown; traditional_rails_note: string | null; potential_saving_pct: number | null }> };
    for (const corridor of body.corridors) {
      expect(corridor.traditional_rails).toBeNull();
      expect(corridor.traditional_rails_note).toContain("World Bank");
      expect(corridor.potential_saving_pct).toBeNull(); // can't compute a saving with no traditional baseline
    }
  });

  it("parses a successful World Bank response when one is available, and leaves other corridors null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === JSDELIVR_URL) return jsonResponse({ date: "2026-10-04", usd: FX_RATES });
        if (url.startsWith(COINGECKO_URL)) return jsonResponse({ algorand: { usd: 0.13 } });
        if (url.includes("iso3=AUS_WSM")) {
          return jsonResponse({ corridors: [{ cc1_average: 6.2, cc1_average_cost_usd: 12.4, cheapest_provider_name: "Example Provider", cheapest_cost_pct: 5.1, no_institutions: 4 }] });
        }
        if (url.startsWith(WORLD_BANK_URL)) return jsonResponse({}, 403);
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors");
    const body = (await res.json()) as {
      corridors: Array<{ corridor_id: string; traditional_rails: { average_cost_pct: number; provider_count: number; cheapest_provider: string | null } | null; potential_saving_pct: number | null }>;
    };

    const ausWst = body.corridors.find((c) => c.corridor_id === "AUS_WST")!;
    expect(ausWst.traditional_rails).not.toBeNull();
    expect(ausWst.traditional_rails?.average_cost_pct).toBe(6.2);
    expect(ausWst.traditional_rails?.provider_count).toBe(4);
    expect(ausWst.traditional_rails?.cheapest_provider).toBe("Example Provider");
    // potential_saving_pct = 6.2 - best crypto cost pct (0.02-ish) ≈ 6.18
    expect(ausWst.potential_saving_pct).toBeCloseTo(6.18, 1);

    const ausFjd = body.corridors.find((c) => c.corridor_id === "AUS_FJD")!;
    expect(ausFjd.traditional_rails).toBeNull();
  });

  it("filters by ?min_saving_pct= using the computed potential_saving_pct (none pass when traditional_rails is always null)", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors?min_saving_pct=5.0");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { corridors: unknown[]; meta: { corridors_returned: number } };
    expect(body.corridors).toHaveLength(0);
    expect(body.meta.corridors_returned).toBe(0);
  });

  it("?min_saving_pct= correctly includes/excludes corridors once a real potential_saving_pct exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === JSDELIVR_URL) return jsonResponse({ date: "2026-10-04", usd: FX_RATES });
        if (url.startsWith(COINGECKO_URL)) return jsonResponse({ algorand: { usd: 0.13 } });
        if (url.includes("iso3=AUS_WSM")) {
          // Saving ~6.18%, passes a 5.0 threshold.
          return jsonResponse({ corridors: [{ cc1_average: 6.2, no_institutions: 4 }] });
        }
        if (url.includes("iso3=AUS_FJI")) {
          // Saving ~1.98%, fails a 5.0 threshold.
          return jsonResponse({ corridors: [{ cc1_average: 2.0, no_institutions: 2 }] });
        }
        if (url.startsWith(WORLD_BANK_URL)) return jsonResponse({}, 403);
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    const app = buildTestApp();
    const res = await app.request("/finance/remittance-corridors?min_saving_pct=5.0");
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
