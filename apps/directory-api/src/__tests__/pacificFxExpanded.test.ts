import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fxRoute } from "../routes/finance/fx.js";
import { __resetFxRateCacheForTests, PACIFIC_CURRENCIES } from "../services/fxRateService.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const JSDELIVR_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
const PAGES_FALLBACK_URL = "https://latest.currency-api.pages.dev/v1/currencies/usd.json";
const OPEN_ER_API_URL = "https://open.er-api.com/v6/latest/USD";
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest";
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";

// Full 17-currency USD-base rate set (matches the live-verified values
// gathered while building this expansion).
const FULL_CURRENCY_API_RATES = {
  wst: 2.74,
  fjd: 2.21,
  top: 2.38,
  pgk: 3.95,
  sbd: 8.43,
  vuv: 119.2,
  xpf: 106.04,
  khr: 4055.05,
  aud: 1.44,
  nzd: 1.78,
  eur: 0.89,
  gbp: 0.76,
  jpy: 157.67,
  cny: 6.72,
  sgd: 1.28,
  cad: 1.42,
  hkd: 7.85,
};

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
  app.route("/", fxRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

function defaultFetchMock() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === JSDELIVR_URL) return jsonResponse({ date: "2026-10-04", usd: FULL_CURRENCY_API_RATES });
    if (url.startsWith(COINGECKO_URL)) return jsonResponse({ algorand: { usd: 0.13 } });
    throw new Error(`unexpected fetch to ${url}`);
  });
}

describe("GET /finance/fx (Pacific FX Registry expansion)", () => {
  beforeEach(() => {
    __resetFxRateCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetFxRateCacheForTests();
  });

  it("includes all 8 Pacific island currencies", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/fx");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rates: Record<string, number> };
    for (const code of PACIFIC_CURRENCIES) {
      expect(body.rates).toHaveProperty(code);
      expect(body.rates[code]).toBeGreaterThan(0);
    }
    expect(PACIFIC_CURRENCIES.length).toBe(8);
  });

  it("includes micro_state_pegs with exactly 3 entries", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/fx");
    const body = (await res.json()) as { micro_state_pegs: Array<{ country: string; currency: string; note: string; peg_confirmed: boolean }> };
    expect(body.micro_state_pegs).toHaveLength(3);
    const countries = body.micro_state_pegs.map((p) => p.country).sort();
    expect(countries).toEqual(["Kiribati", "Nauru", "Tuvalu"]);
    for (const peg of body.micro_state_pegs) {
      expect(peg.currency).toBe("AUD");
      expect(peg.note).toBe("pegged_to_aud");
      expect(peg.peg_confirmed).toBe(true);
    }
  });

  it("?base=AUD re-bases every rate to AUD instead of USD", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/fx?base=AUD");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { base: string; rates: Record<string, number> };
    expect(body.base).toBe("AUD");
    // WST/AUD = (WST/USD) / (AUD/USD) = 2.74 / 1.44
    expect(body.rates.WST).toBeCloseTo(2.74 / 1.44, 4);
    expect(body.rates.USD).toBeCloseTo(1 / 1.44, 4);
    expect(body.rates).not.toHaveProperty("AUD");
  });

  it("?pacific_only=true returns only Pacific island currencies plus ALGO/USDC, and still includes micro_state_pegs", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/fx?pacific_only=true");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rates: Record<string, number>; micro_state_pegs: unknown[] };
    const keys = Object.keys(body.rates).sort();
    expect(keys).toEqual([...PACIFIC_CURRENCIES, "ALGO", "USDC"].sort());
    expect(body.micro_state_pegs).toHaveLength(3);
  });

  it("?pairs=WST,FJD returns only those two currencies", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/fx?pairs=WST,FJD");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rates: Record<string, number> };
    expect(Object.keys(body.rates).sort()).toEqual(["FJD", "WST"]);
  });

  it("returns 400 for an unsupported currency in ?pairs=", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/fx?pairs=WST,XXX");
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unsupported ?base=", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/fx?base=XXX");
    expect(res.status).toBe(400);
  });

  it("falls back to open.er-api.com (the newly-added second source) when currency-api is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === JSDELIVR_URL || url === PAGES_FALLBACK_URL) throw new Error("network error");
        if (url === OPEN_ER_API_URL) {
          return jsonResponse({
            result: "success",
            rates: { USD: 1, WST: 2.74, FJD: 2.24, TOP: 2.39, PGK: 4.47, SBD: 7.95, VUV: 119.9, XPF: 106.06, KHR: 4053.35, AUD: 1.44, NZD: 1.78, EUR: 0.89, GBP: 0.76, JPY: 157.8, CNY: 6.72, SGD: 1.28, CAD: 1.42, HKD: 7.85 },
          });
        }
        if (url.startsWith(COINGECKO_URL)) return jsonResponse({ algorand: { usd: 0.13 } });
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    const app = buildTestApp();
    const res = await app.request("/finance/fx");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; data_sources: string[]; rates: Record<string, number> };
    expect(body.source).toBe("open-er-api");
    expect(body.data_sources).toEqual(["ExchangeRate-API (open.er-api.com)"]);
    expect(body.rates.FJD).toBe(2.24);
  });

  it("gracefully falls back to Frankfurter+static (with an explanatory coverage_note) when both full-coverage sources fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === JSDELIVR_URL || url === PAGES_FALLBACK_URL || url === OPEN_ER_API_URL) throw new Error("network error");
        if (url.startsWith(FRANKFURTER_URL)) {
          return jsonResponse({ amount: 1, base: "USD", date: "2026-10-04", rates: { AUD: 1.44, NZD: 1.78, EUR: 0.89, GBP: 0.76, JPY: 157.67, CNY: 6.72, SGD: 1.28, CAD: 1.42, HKD: 7.85 } });
        }
        if (url.startsWith(COINGECKO_URL)) return jsonResponse({ algorand: { usd: 0.13 } });
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    const app = buildTestApp();
    const res = await app.request("/finance/fx");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; coverage_note: string; rates: Record<string, number> };
    expect(body.source).toBe("frankfurter-partial+static");
    expect(body.coverage_note).toContain("NOT available from ECB");
    expect(body.rates.AUD).toBe(1.44); // from Frankfurter
    expect(body.rates.WST).toBeGreaterThan(0); // from static fallback
  });

  it("always includes not_financial_advice: true", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/fx");
    const body = (await res.json()) as { not_financial_advice: boolean };
    expect(body.not_financial_advice).toBe(true);
  });

  it("always includes a non-empty data_sources array naming the source actually used this cycle", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/fx");
    const body = (await res.json()) as { data_sources: string[] };
    expect(Array.isArray(body.data_sources)).toBe(true);
    expect(body.data_sources.length).toBeGreaterThan(0);
    expect(body.data_sources[0]).toContain("currency-api");
  });

  it("always includes data_currency: daily and a cache_expires_at timestamp", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/fx");
    const body = (await res.json()) as { data_currency: string; cache_expires_at: string; generated_at: string };
    expect(body.data_currency).toBe("daily");
    expect(new Date(body.cache_expires_at).getTime()).toBeGreaterThan(new Date(body.generated_at).getTime());
  });
});
