import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fxRoute } from "../routes/finance/fx.js";
import { __resetFxRateCacheForTests } from "../services/fxRateService.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const JSDELIVR_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
const PAGES_FALLBACK_URL = "https://latest.currency-api.pages.dev/v1/currencies/usd.json";
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest";
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";

const CURRENCY_API_USD_RATES = {
  wst: 2.7159,
  fjd: 2.1916,
  top: 2.4083,
  pgk: 4.4364,
  sbd: 8.0077,
  vuv: 118.3597,
  aud: 1.3963,
  nzd: 1.6776,
  eur: 0.8573,
  gbp: 0.7335,
  jpy: 159.12,
  cny: 6.7227,
};

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("GET /finance/fx", () => {
  beforeEach(() => {
    __resetFxRateCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetFxRateCacheForTests();
  });

  it("returns 200 with all rates when the primary currency-api source and CoinGecko both succeed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === JSDELIVR_URL) return jsonResponse({ date: "2026-08-25", usd: CURRENCY_API_USD_RATES });
        if (url.startsWith(COINGECKO_URL)) return jsonResponse({ algorand: { usd: 0.092 } });
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    const app = buildTestApp();
    const res = await app.request("/finance/fx");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.source).toBe("currency-api");
    expect(body.base).toBe("USD");
    expect(body.rates).toMatchObject({
      WST: 2.7159,
      FJD: 2.1916,
      TOP: 2.4083,
      PGK: 4.4364,
      SBD: 8.0077,
      VUV: 118.3597,
      AUD: 1.3963,
      NZD: 1.6776,
      ALGO: 0.092,
      USDC: 1.0,
    });
  });

  it("converts an amount when from, to, and amount are all provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === JSDELIVR_URL) return jsonResponse({ date: "2026-08-25", usd: CURRENCY_API_USD_RATES });
        if (url.startsWith(COINGECKO_URL)) return jsonResponse({ algorand: { usd: 0.092 } });
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    const app = buildTestApp();
    const res = await app.request("/finance/fx?from=WST&to=USD&amount=100");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { converted?: { from: string; to: string; amount: number; result: number } };
    expect(body.converted).toBeDefined();
    expect(body.converted?.from).toBe("WST");
    expect(body.converted?.to).toBe("USD");
    expect(body.converted?.result).toBeCloseTo(100 / 2.7159, 2);
  });

  it("returns 400 when from is given without to and amount", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/fx?from=WST");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("returns 400 for an unsupported currency", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/fx?from=XXX&to=USD&amount=100");
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-positive amount", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/fx?from=WST&to=USD&amount=-5");
    expect(res.status).toBe(400);
  });

  it("falls back to Frankfurter (majors only) plus static rates when both currency-api hosts fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === JSDELIVR_URL || url === PAGES_FALLBACK_URL) throw new Error("network error");
        if (url.startsWith(FRANKFURTER_URL)) {
          return jsonResponse({ amount: 1, base: "USD", date: "2026-08-25", rates: { AUD: 1.3963, NZD: 1.6776, EUR: 0.8573, GBP: 0.7335, JPY: 159.12, CNY: 6.7227 } });
        }
        if (url.startsWith(COINGECKO_URL)) return jsonResponse({ algorand: { usd: 0.092 } });
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    const app = buildTestApp();
    const res = await app.request("/finance/fx");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.source).toBe("frankfurter-partial+static");
    const rates = body.rates as Record<string, number>;
    expect(rates.AUD).toBe(1.3963);
    // Frankfurter has no Pacific currency data — these come from the static fallback.
    expect(rates.WST).toBeGreaterThan(0);
  });

  it("falls back to static-only rates when every live source is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );

    const app = buildTestApp();
    const res = await app.request("/finance/fx");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.source).toBe("static-only");
    const rates = body.rates as Record<string, number>;
    expect(rates.WST).toBeGreaterThan(0);
    expect(rates.ALGO).toBe(0);
    expect(rates.USDC).toBe(1.0);
  });
});
