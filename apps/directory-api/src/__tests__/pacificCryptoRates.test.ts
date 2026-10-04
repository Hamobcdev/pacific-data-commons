import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pacificCryptoRatesRoute } from "../routes/finance/crypto-rates.js";
import {
  getCryptoRatesSnapshot,
  __resetCryptoRatesCacheForTests,
  CURATED_TOKEN_IDS,
  COINGECKO_MARKETS_URL,
  type CryptoPriceCronRecord,
} from "../services/pacificCryptoRatesService.js";
import { paidRoutes } from "../routeSchemas.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { createFakeKv } from "./testUtils.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";
import type { KVNamespace } from "@cloudflare/workers-types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

interface MockCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  price_change_percentage_24h: number | null;
  market_cap: number | null;
  total_volume: number | null;
  market_cap_rank: number | null;
}

function coin(id: string, symbol: string, name: string, price: number | null, rank: number | null): MockCoin {
  return { id, symbol, name, current_price: price, price_change_percentage_24h: 1.23, market_cap: 1_000_000, total_volume: 500_000, market_cap_rank: rank };
}

// A small, deterministic subset standing in for all 67 curated tokens —
// every curated id not included here is implicitly "missing from
// CoinGecko's response", exercising fetch_warnings realistically without
// needing to mock all 67 for every test.
const FULL_MOCK_SET: MockCoin[] = [
  coin("algorand", "algo", "Algorand", 0.13, 72),
  coin("ripple", "xrp", "XRP", 1.5, 5),
  coin("stellar", "xlm", "Stellar", 0.25, 20),
  coin("bitcoin", "btc", "Bitcoin", 85000, 1),
  coin("ethereum", "eth", "Ethereum", 2700, 2),
  coin("uniswap", "uni", "Uniswap", 7.5, 23),
  coin("arbitrum", "arb", "Arbitrum", 0.5, 68),
  coin("dogecoin", "doge", "Dogecoin", 0.2, 12),
  coin("tether", "usdt", "Tether", 1.0, null), // no current_price -> excluded + warned
];

function defaultFetchMock() {
  return vi.fn(async () => jsonResponse(FULL_MOCK_SET.filter((c) => c.current_price !== null)));
}

function buildTestApp(kv?: KVNamespace) {
  const app = new Hono<AppBindings>();
  const env = {} as Env;
  app.use("*", async (c, next) => {
    c.set("env", env);
    c.set("cryptoPricesKv", kv);
    await next();
  });
  app.route("/", pacificCryptoRatesRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("CURATED_TOKEN_IDS", () => {
  it("never includes a token known-dropped during live verification", () => {
    expect(CURATED_TOKEN_IDS).not.toContain("polygon");
    expect(CURATED_TOKEN_IDS).not.toContain("compound");
    expect(CURATED_TOKEN_IDS).not.toContain("synthetix");
    expect(CURATED_TOKEN_IDS).not.toContain("base");
  });

  it("always includes the 3 Pacific-priority tokens", () => {
    expect(CURATED_TOKEN_IDS).toContain("algorand");
    expect(CURATED_TOKEN_IDS).toContain("ripple");
    expect(CURATED_TOKEN_IDS).toContain("stellar");
  });

  it("has no duplicate ids (the build brief listed aptos twice)", () => {
    expect(new Set(CURATED_TOKEN_IDS).size).toBe(CURATED_TOKEN_IDS.length);
  });
});

describe("getCryptoRatesSnapshot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetCryptoRatesCacheForTests();
  });

  it("returns mapped tokens with uppercased symbols", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const snapshot = await getCryptoRatesSnapshot();
    expect(snapshot).not.toBeNull();
    const btc = snapshot?.tokens.find((t) => t.coingecko_id === "bitcoin");
    expect(btc?.symbol).toBe("BTC");
    expect(btc?.price_usd).toBe(85000);
    expect(btc?.market_cap_rank).toBe(1);
  });

  it("omits a curated token missing from the response and adds a fetch_warning", async () => {
    // tether is in the curated list but excluded from this mock's "live" data entirely.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(FULL_MOCK_SET.filter((c) => c.id !== "tether" && c.current_price !== null))),
    );
    const snapshot = await getCryptoRatesSnapshot();
    expect(snapshot?.tokens.some((t) => t.coingecko_id === "tether")).toBe(false);
    expect(snapshot?.fetch_warnings.some((w) => w.includes("tether"))).toBe(true);
  });

  it("omits a token present in the response but with current_price: null, and adds a fetch_warning — never fabricates a price", async () => {
    // Distinct from the "missing entirely" case above: tether IS present
    // in this mock response, just with a null price.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([...FULL_MOCK_SET.filter((c) => c.current_price !== null), coin("tether", "usdt", "Tether", null, null)])),
    );
    const snapshot = await getCryptoRatesSnapshot();
    expect(snapshot?.tokens.some((t) => t.coingecko_id === "tether")).toBe(false);
    expect(snapshot?.fetch_warnings.some((w) => w.includes("tether"))).toBe(true);
  });

  it("serves the static fallback (never null, never throws) when the upstream fetch returns a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([], 500)),
    );
    const snapshot = await getCryptoRatesSnapshot();
    expect(snapshot.static_fallback).toBe(true);
    expect(snapshot.static_fallback_reason).toBe("upstream_blocked");
    expect(snapshot.prices_as_of).toBe("2026-10-05");
    expect(snapshot.tokens.length).toBeGreaterThan(0);
    expect(snapshot.tokens.some((t) => t.symbol === "ALGO")).toBe(true);
  });

  it("serves the static fallback (never null, never throws) when the fetch rejects outright", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const snapshot = await getCryptoRatesSnapshot();
    expect(snapshot.static_fallback).toBe(true);
    expect(snapshot.tokens.length).toBeGreaterThan(0);
  });

  it("marks a live snapshot's static_fallback fields as false/null", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const snapshot = await getCryptoRatesSnapshot();
    expect(snapshot.static_fallback).toBe(false);
    expect(snapshot.static_fallback_reason).toBeNull();
    expect(snapshot.prices_as_of).toBeNull();
  });

  it("static fallback never fabricates a price for tokens outside the named static set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const snapshot = await getCryptoRatesSnapshot();
    expect(snapshot.tokens.map((t) => t.symbol).sort()).toEqual(["ALGO", "BTC", "ETH", "USDC", "USDT", "XLM", "XRP"]);
    expect(snapshot.fetch_warnings.some((w) => w.includes("static fallback"))).toBe(true);
  });

  it("caches the snapshot for the 60-second TTL — a second call doesn't re-fetch", async () => {
    const fetchSpy = defaultFetchMock();
    vi.stubGlobal("fetch", fetchSpy);

    await getCryptoRatesSnapshot();
    const callsAfterFirst = fetchSpy.mock.calls.length;
    await getCryptoRatesSnapshot();

    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it("requests all curated ids in a single call", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain(COINGECKO_MARKETS_URL);
      expect(url).toContain("vs_currency=usd");
      expect(url).toContain("algorand"); // one representative curated id, present in the single combined ids= param
      return jsonResponse(FULL_MOCK_SET.filter((c) => c.current_price !== null));
    });
    vi.stubGlobal("fetch", fetchSpy);
    await getCryptoRatesSnapshot();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("getCryptoRatesSnapshot with a KV binding (Cloudflare Workers live feed)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetCryptoRatesCacheForTests();
  });

  function cronRecord(overrides: Partial<CryptoPriceCronRecord> = {}): CryptoPriceCronRecord {
    return {
      updated_at: "2026-10-05T00:05:00.000Z",
      source: "binance",
      static_fallback: false,
      tokens: [
        { symbol: "ALGO", name: "Algorand", coingecko_id: "algorand", price_usd: 0.1323, change_24h_pct: 2.5, market_cap_usd: 0, volume_24h_usd: 0, market_cap_rank: null },
      ],
      ...overrides,
    };
  }

  it("returns the KV record directly, without calling fetch, when prices:current is present and non-empty", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const kv = createFakeKv({ "prices:current": JSON.stringify(cronRecord()) });

    const snapshot = await getCryptoRatesSnapshot(kv);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(snapshot.static_fallback).toBe(false);
    expect(snapshot.static_fallback_reason).toBeNull();
    expect(snapshot.cached_at).toBe("2026-10-05T00:05:00.000Z");
    expect(snapshot.tokens.map((t) => t.symbol)).toEqual(["ALGO"]);
  });

  it("falls through to the static fallback (not a live CoinGecko-from-Workers attempt) when prices:current is missing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const kv = createFakeKv();

    const snapshot = await getCryptoRatesSnapshot(kv);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(snapshot.static_fallback).toBe(true);
    expect(snapshot.static_fallback_reason).toBe("kv_unavailable");
    expect(snapshot.tokens.some((t) => t.symbol === "ALGO")).toBe(true);
  });

  it("falls through to the static fallback when prices:current has an empty tokens array", async () => {
    const kv = createFakeKv({ "prices:current": JSON.stringify(cronRecord({ tokens: [] })) });

    const snapshot = await getCryptoRatesSnapshot(kv);

    expect(snapshot.static_fallback).toBe(true);
    expect(snapshot.static_fallback_reason).toBe("kv_unavailable");
  });

  it("falls through to the static fallback (never throws) when the stored KV value is malformed JSON", async () => {
    const kv = createFakeKv({ "prices:current": "{not valid json" });

    const snapshot = await getCryptoRatesSnapshot(kv);

    expect(snapshot.static_fallback).toBe(true);
    expect(snapshot.static_fallback_reason).toBe("kv_unavailable");
  });

  it("without a KV binding, behaves exactly as before — attempts the live CoinGecko fetch", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());

    const snapshot = await getCryptoRatesSnapshot(undefined);

    expect(snapshot.static_fallback).toBe(false);
  });
});

describe("GET /finance/crypto-rates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetCryptoRatesCacheForTests();
  });

  it("returns the full curated list with no query params", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tokens: unknown[]; total_tokens: number };
    expect(body.tokens.length).toBe(body.total_tokens);
    expect(body.tokens.length).toBeGreaterThan(0);
  });

  it("always sets data_currency to real-time", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates");
    const body = (await res.json()) as { data_currency: string };
    expect(body.data_currency).toBe("real-time");
  });

  it("always includes attribution", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates");
    const body = (await res.json()) as { attribution: string };
    expect(body.attribution).toBe("CoinGecko Public API — https://www.coingecko.com/en/api");
  });

  it("always includes pacific_priority_tokens, regardless of filtering", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates?symbols=BTC");
    const body = (await res.json()) as { pacific_priority_tokens: string[] };
    expect(body.pacific_priority_tokens).toEqual(["ALGO", "XRP", "XLM"]);
  });

  it("always includes a fetch_warnings array, even when empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(FULL_MOCK_SET.filter((c) => c.current_price !== null && c.id !== "tether"))),
    );
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates?symbols=BTC");
    const body = (await res.json()) as { fetch_warnings: unknown[] };
    expect(Array.isArray(body.fetch_warnings)).toBe(true);
  });

  it("filters to the requested symbols, case-insensitively", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates?symbols=btc,eth");
    const body = (await res.json()) as { tokens: Array<{ symbol: string }> };
    expect(body.tokens.map((t) => t.symbol).sort()).toEqual(["BTC", "ETH"]);
  });

  it("filters to a partial match (some valid, some unknown) without 400ing", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates?symbols=BTC,NOTREAL");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tokens: Array<{ symbol: string }> };
    expect(body.tokens.map((t) => t.symbol)).toEqual(["BTC"]);
  });

  it("returns 400 when every requested symbol is outside the curated list", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates?symbols=NOTREAL,ALSOFAKE");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("returns exactly ALGO, XRP, XLM for ?category=pacific", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates?category=pacific");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tokens: Array<{ symbol: string }> };
    expect(body.tokens.map((t) => t.symbol).sort()).toEqual(["ALGO", "XLM", "XRP"]);
  });

  it("filters to defi-category tokens for ?category=defi", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates?category=defi");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tokens: Array<{ symbol: string }> };
    expect(body.tokens.map((t) => t.symbol)).toEqual(["UNI"]);
  });

  it("filters to l2-category tokens for ?category=l2", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates?category=l2");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tokens: Array<{ symbol: string }> };
    expect(body.tokens.map((t) => t.symbol)).toEqual(["ARB"]);
  });

  it("combines category and symbols — category applied first, then symbols on top", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates?category=pacific&symbols=XRP");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tokens: Array<{ symbol: string }> };
    expect(body.tokens.map((t) => t.symbol)).toEqual(["XRP"]);
  });

  it("returns 400 for an unrecognised category value", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates?category=notacategory");
    expect(res.status).toBe(400);
  });

  it("returns 200 with Cache-Control for a valid request", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("serves from the KV live feed (data_currency real-time, no fetch call) when cryptoPricesKv is set on context", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const kv = createFakeKv({
      "prices:current": JSON.stringify({
        updated_at: "2026-10-05T00:05:00.000Z",
        source: "binance",
        static_fallback: false,
        tokens: [{ symbol: "ALGO", name: "Algorand", coingecko_id: "algorand", price_usd: 0.1323, change_24h_pct: 2.5, market_cap_usd: 0, volume_24h_usd: 0, market_cap_rank: null }],
      }),
    });
    const app = buildTestApp(kv);

    const res = await app.request("/finance/crypto-rates");

    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = (await res.json()) as { data_currency: string; tokens: Array<{ symbol: string }> };
    expect(body.data_currency).toBe("real-time");
    expect(body.tokens.map((t) => t.symbol)).toEqual(["ALGO"]);
  });

  it("returns 200 with the static fallback (never 502) when CoinGecko is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { static_fallback: boolean; static_fallback_reason: string; prices_as_of: string; data_currency: string; tokens: unknown[] };
    expect(body.static_fallback).toBe(true);
    expect(body.static_fallback_reason).toBe("upstream_blocked");
    expect(body.prices_as_of).toBe("2026-10-05");
    expect(body.data_currency).toBe("static-fallback");
    expect(body.tokens.length).toBeGreaterThan(0);
  });

  it("returns 200 with the static fallback (never 502) when CoinGecko returns a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([], 429)),
    );
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { static_fallback: boolean };
    expect(body.static_fallback).toBe(true);
  });

  it("returns live static_fallback: false and null reason/prices_as_of when CoinGecko is reachable", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/crypto-rates");
    const body = (await res.json()) as { static_fallback: boolean; static_fallback_reason: string | null; prices_as_of: string | null; data_currency: string };
    expect(body.static_fallback).toBe(false);
    expect(body.static_fallback_reason).toBeNull();
    expect(body.prices_as_of).toBeNull();
    expect(body.data_currency).toBe("real-time");
  });
});

describe("routeSchemas: /finance/crypto-rates payment gate", () => {
  it("is registered as a paid route with the expected Tier 1 price", () => {
    const route = paidRoutes.find((r) => r.path === "/finance/crypto-rates" && r.method === "GET");
    expect(route).toBeDefined();
    expect(route?.priceUsdc).toBe(0.001);
  });
});
