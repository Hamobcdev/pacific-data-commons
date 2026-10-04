import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pacificDexArbitrageRoute } from "../routes/finance/arbitrage-signals.js";
import {
  getArbitrageSnapshot,
  __resetDexArbitrageCacheForTests,
  CURATED_PAIRS,
  toRawUnits,
  toDisplayUnits,
  resolveTokenDecimals,
} from "../services/pacificDexArbitrageService.js";
import { paidRoutes } from "../routeSchemas.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

// Pool addresses from CURATED_PAIRS, pulled out for readable mock wiring.
const ETH_USDC_ETH = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";
const ETH_USDC_ARB = "0xc31e54c7a869b9fcbecc14363cf510d1c41fa443";
const BTC_USDC_V3 = "0x99ac8ca7087fa4a2a1fb6357269965a2014abc35";
const BTC_USDC_V4 = "0xb98437c7ba28c6590dd4e1cc46aa89eed181f97108e5b6221730d41347bc817f";
const LINK_ETH_V3 = "0xa6cc3c2531fdaa6ae1a3ca84c2855806728693e8";
const LINK_ETH_V2 = "0xa2107fa5b38d9bbd2c461d6edf11b11a50f6b974";
const UNI_ETH_V3 = "0x1d42064fc4beb5f8aaf85f4617ae8b3b5b8bd801";
const UNI_ETH_V2 = "0xd3d2e2692501a5c9ca623199d38826e513033a17";
const CRV_ETH_V3 = "0x919fa96e88d67499339577fa202345436bcdaf79";
const CRV_ETH_SUSHI = "0x3bff1d56992702ecf7acb0d2a7f23eec459e8587";
const BNB_USDC_V3 = "0xf2688fb5b81049dfb7703ada5e770543770612c4";
const BNB_USDC_V2 = "0xd99c7f6c65857ac913a8f880a4cb84032ab2fc5b";
const TINYMAN_ALGO_USDC = "FPOU46NBKTWUZCNMNQNXRWNW3SMPOOK4ZJIN5WSILCWP662ANJLTXVRUKA";
const PACT_ALGO_USDC = "ULYZAQ5BQ47ZOJZXV3FBLSP2RI34YLPPJPA7EAPTNNOKLUFNI5OCA7KFWU";

function geckoPool(address: string, baseUsd: number, quoteUsd: number, liquidityUsd: number) {
  return { id: `x_${address}`, attributes: { base_token_price_usd: String(baseUsd), quote_token_price_usd: String(quoteUsd), reserve_in_usd: String(liquidityUsd) } };
}

function geckoMultiResponse(pools: ReturnType<typeof geckoPool>[]) {
  return jsonResponse({ data: pools });
}

function rpcGasResponse(gasPriceWei: number) {
  return jsonResponse({ jsonrpc: "2.0", id: 1, result: `0x${gasPriceWei.toString(16)}` });
}

function tinymanPool(algoReserve: number, usdcReserve: number) {
  return jsonResponse({
    asset_1: { unit_name: "USDC", decimals: 6 },
    asset_2: { unit_name: "ALGO", decimals: 6 },
    current_asset_1_reserves: String(usdcReserve * 1e6),
    current_asset_2_reserves: String(algoReserve * 1e6),
  });
}

function pactPoolsResponse(entries: Array<{ address: string; price: number; tvlUsd: number }>) {
  return jsonResponse({
    results: entries.map((e) => ({ on_chain_address: e.address, primary_asset: { price: String(e.price) }, tvl_usd: String(e.tvlUsd) })),
  });
}

// Clean, hand-verifiable defaults — see test file header reasoning in
// each describe block for the arithmetic behind the exact numbers.
// ETH/USDC: eth 2700, arbitrum 2701 -> small gross spread, net negative (weak, not profitable).
// BTC/USDC: v3 (base=WBTC) 85000, v4 (quote=WBTC) 85100.
// LINK/ETH: v3 14.0, v2 14.2.
// UNI/ETH: v3 9.00, v2 9.03 -> moderate net after ethereum gas.
// CRV/ETH: v3 0.37, sushi 0.40 -> large gross spread, strong net.
// BNB/USDC (base=USDC, quote=WBNB): v3 quote 600, v2 quote 601 -> moderate net after bnb gas.
// ALGO/USDC: Tinyman reserves 1,000,000 ALGO / 132,000 USDC (price 0.132), Pact price 0.13, tvl 150,000.
function defaultFetchMock() {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("/networks/eth/pools/multi/")) {
      return geckoMultiResponse([
        geckoPool(ETH_USDC_ETH, 2700, 1, 20_000_000),
        geckoPool(BTC_USDC_V3, 85000, 1, 20_000_000),
        geckoPool(BTC_USDC_V4, 1, 85100, 9_000_000),
        geckoPool(LINK_ETH_V3, 14.0, 1, 10_000_000),
        geckoPool(LINK_ETH_V2, 14.2, 1, 1_000_000),
        geckoPool(UNI_ETH_V3, 9.0, 1, 10_000_000),
        geckoPool(UNI_ETH_V2, 9.03, 1, 1_000_000),
        geckoPool(CRV_ETH_V3, 0.37, 1, 500_000),
        geckoPool(CRV_ETH_SUSHI, 0.4, 1, 200_000),
      ]);
    }
    if (url.includes("/networks/arbitrum/pools/multi/")) {
      return geckoMultiResponse([geckoPool(ETH_USDC_ARB, 2701, 1, 1_000_000)]);
    }
    if (url.includes("/networks/bsc/pools/multi/")) {
      return geckoMultiResponse([geckoPool(BNB_USDC_V3, 1, 600, 2_000_000), geckoPool(BNB_USDC_V2, 1, 601, 300_000)]);
    }
    if (url.includes("mainnet.analytics.tinyman.org")) {
      return tinymanPool(1_000_000, 132_000);
    }
    if (url.includes("api.pact.fi")) {
      return pactPoolsResponse([{ address: PACT_ALGO_USDC, price: 0.13, tvlUsd: 150_000 }]);
    }
    if (url === "https://ethereum-rpc.publicnode.com" || (init?.body as string | undefined)?.includes("eth_gasPrice")) {
      if (url.includes("bsc-dataseed")) return rpcGasResponse(5_000_000_000); // 5 gwei
      return rpcGasResponse(20_000_000_000); // 20 gwei
    }
    return jsonResponse({}, 404);
  });
}

function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = {} as Env;
  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });
  app.route("/", pacificDexArbitrageRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("toRawUnits", () => {
  it("converts 1.5 at 6 decimals to 1500000n", () => {
    expect(toRawUnits(1.5, 6)).toBe(1500000n);
  });

  it("converts 1.5 at 18 decimals to 1500000000000000000n", () => {
    expect(toRawUnits(1.5, 18)).toBe(1500000000000000000n);
  });

  it("converts the minimum USDC unit (0.000001 at 6 decimals) to 1n", () => {
    expect(toRawUnits(0.000001, 6)).toBe(1n);
  });

  it("converts 1 WBTC (1.0 at 8 decimals) to 100000000n", () => {
    expect(toRawUnits(1.0, 8)).toBe(100000000n);
  });

  it("truncates (not rounds) fractional digits beyond the target decimals", () => {
    expect(toRawUnits(1.123456789, 6)).toBe(1123456n);
  });
});

describe("toDisplayUnits", () => {
  it("converts 1500000n at 6 decimals to 1.5", () => {
    expect(toDisplayUnits(1500000n, 6)).toBe(1.5);
  });

  it("converts 1500000000000000000n at 18 decimals to 1.5", () => {
    expect(toDisplayUnits(1500000000000000000n, 18)).toBe(1.5);
  });

  it("converts 1n at 6 decimals to 0.000001", () => {
    expect(toDisplayUnits(1n, 6)).toBe(0.000001);
  });

  it("converts 100000000n at 8 decimals to 1.0", () => {
    expect(toDisplayUnits(100000000n, 8)).toBe(1.0);
  });
});

describe("toRawUnits / toDisplayUnits round-trip", () => {
  const values = [0.000001, 0.5, 1.0, 1.5, 100.0, 999999.99];

  it.each(values)("round-trips %p at 6 decimals", (x) => {
    expect(toDisplayUnits(toRawUnits(x, 6), 6)).toBe(x);
  });

  it.each([0.000001, 0.5, 1.0, 1.5])("round-trips %p at 18 decimals", (x) => {
    expect(toDisplayUnits(toRawUnits(x, 18), 18)).toBe(x);
  });
});

describe("resolveTokenDecimals", () => {
  it("resolves USDC to 6 decimals from the registry", () => {
    expect(resolveTokenDecimals("USDC")).toEqual({ decimals: 6, source: "registry" });
  });

  it("resolves ETH to 18 decimals from the registry", () => {
    expect(resolveTokenDecimals("ETH")).toEqual({ decimals: 18, source: "registry" });
  });

  it("resolves ALGO to 6 decimals from the registry", () => {
    expect(resolveTokenDecimals("ALGO")).toEqual({ decimals: 6, source: "registry" });
  });

  it("resolves BTC to 8 decimals from the registry", () => {
    expect(resolveTokenDecimals("BTC")).toEqual({ decimals: 8, source: "registry" });
  });

  it("defaults to 18 decimals with source default-18 for a token not in the registry", () => {
    expect(resolveTokenDecimals("NOTAREALTOKEN")).toEqual({ decimals: 18, source: "default-18" });
  });
});

describe("getArbitrageSnapshot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetDexArbitrageCacheForTests();
  });

  it("returns all 7 curated pairs as total_pairs_monitored", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const snapshot = await getArbitrageSnapshot();
    expect(snapshot?.total_pairs_monitored).toBe(7);
    expect(CURATED_PAIRS.length).toBe(7);
  });

  it("computes ETH/USDC as a weak, unprofitable signal (small gross spread, gas exceeds it)", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const snapshot = await getArbitrageSnapshot();
    const sig = snapshot?.signals.find((s) => s.pair === "ETH/USDC");
    expect(sig).toBeDefined();
    expect(sig?.gross_spread_pct).toBeCloseTo(0.037, 2);
    expect(sig?.net_spread_pct).not.toBeNull();
    expect(sig!.net_spread_pct!).toBeLessThan(0.1);
    expect(sig?.signal_quality).toBe("weak");
    expect(sig?.is_profitable_estimated).toBe(false);
    expect(sig?.best_buy_venue).toBe("Uniswap v3 / ethereum");
    expect(sig?.best_sell_venue).toBe("Uniswap v3 / arbitrum");
  });

  it("computes UNI/ETH as a moderate signal", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const snapshot = await getArbitrageSnapshot();
    const sig = snapshot?.signals.find((s) => s.pair === "UNI/ETH");
    expect(sig?.signal_quality).toBe("moderate");
    expect(sig!.net_spread_pct!).toBeGreaterThan(0.1);
    expect(sig!.net_spread_pct!).toBeLessThanOrEqual(0.5);
  });

  it("computes CRV/ETH as a strong, profitable signal (large gross spread)", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const snapshot = await getArbitrageSnapshot();
    const sig = snapshot?.signals.find((s) => s.pair === "CRV/ETH");
    expect(sig?.signal_quality).toBe("strong");
    expect(sig!.net_spread_pct!).toBeGreaterThan(0.5);
    expect(sig?.is_profitable_estimated).toBe(true);
  });

  it("computes BNB/USDC correctly from the quote-side price (targetIsBase: false)", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const snapshot = await getArbitrageSnapshot();
    const sig = snapshot?.signals.find((s) => s.pair === "BNB/USDC");
    expect(sig).toBeDefined();
    const venuePrices = sig?.venues.map((v) => v.spot_price_usd).sort();
    expect(venuePrices).toEqual([600, 601]);
  });

  it("computes ALGO/USDC using Tinyman's reserve ratio and Pact's direct price", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const snapshot = await getArbitrageSnapshot();
    const sig = snapshot?.signals.find((s) => s.pair === "ALGO/USDC");
    expect(sig).toBeDefined();
    const prices = sig?.venues.map((v) => v.spot_price_usd).sort();
    expect(prices?.[0]).toBeCloseTo(0.13, 5);
    expect(prices?.[1]).toBeCloseTo(0.132, 5);
  });

  it("values Tinyman's liquidity using Pact's live ALGO price, not a fabricated figure", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const snapshot = await getArbitrageSnapshot();
    const sig = snapshot?.signals.find((s) => s.pair === "ALGO/USDC");
    const tinymanVenue = sig?.venues.find((v) => v.dex === "Tinyman");
    // 132,000 USDC + 1,000,000 ALGO * 0.13 = 262,000
    expect(tinymanVenue?.liquidity_usd).toBeCloseTo(262_000, 0);
  });

  it("always includes gas_disclaimer on every signal", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const snapshot = await getArbitrageSnapshot();
    expect(snapshot!.signals.length).toBeGreaterThan(0);
    for (const sig of snapshot!.signals) {
      expect(sig.gas_disclaimer).toBe("Gas estimates are approximate and may differ at execution time. Verify before trading.");
    }
  });

  it("drops a venue below the $100,000 liquidity minimum and adds a fetch_warning", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/networks/eth/pools/multi/")) {
        return geckoMultiResponse([
          geckoPool(UNI_ETH_V3, 9.0, 1, 10_000_000),
          geckoPool(UNI_ETH_V2, 9.03, 1, 50_000), // below $100k — must be dropped
        ]);
      }
      if (url.includes("/networks/arbitrum/pools/multi/")) return geckoMultiResponse([]);
      if (url.includes("/networks/bsc/pools/multi/")) return geckoMultiResponse([]);
      if (url.includes("tinyman")) return jsonResponse({}, 500);
      if (url.includes("pact")) return jsonResponse({}, 500);
      if ((init?.body as string | undefined)?.includes("eth_gasPrice")) return rpcGasResponse(20_000_000_000);
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const snapshot = await getArbitrageSnapshot();
    expect(snapshot?.signals.find((s) => s.pair === "UNI/ETH")).toBeUndefined();
    expect(snapshot?.fetch_warnings.some((w) => w.includes("UNI/ETH") && w.includes("below the $100,000 minimum"))).toBe(true);
  });

  it("omits a pair with fewer than 2 venues after filtering and adds a fetch_warning", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/networks/eth/pools/multi/")) {
        return geckoMultiResponse([geckoPool(LINK_ETH_V3, 14.0, 1, 10_000_000)]); // LINK_ETH_V2 simply absent from response
      }
      if (url.includes("/networks/arbitrum/pools/multi/")) return geckoMultiResponse([]);
      if (url.includes("/networks/bsc/pools/multi/")) return geckoMultiResponse([]);
      if (url.includes("tinyman")) return jsonResponse({}, 500);
      if (url.includes("pact")) return jsonResponse({}, 500);
      if ((init?.body as string | undefined)?.includes("eth_gasPrice")) return rpcGasResponse(20_000_000_000);
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const snapshot = await getArbitrageSnapshot();
    expect(snapshot?.signals.find((s) => s.pair === "LINK/ETH")).toBeUndefined();
    expect(snapshot?.fetch_warnings.some((w) => w.includes("LINK/ETH") && w.includes("only 1 venue"))).toBe(true);
  });

  it("returns a real snapshot (not null) when only some DEX sources fail — partial failure never 502s", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/networks/eth/pools/multi/")) return jsonResponse({}, 500); // eth down
      if (url.includes("/networks/arbitrum/pools/multi/")) return geckoMultiResponse([geckoPool(ETH_USDC_ARB, 2701, 1, 1_000_000)]);
      if (url.includes("/networks/bsc/pools/multi/")) return geckoMultiResponse([]);
      if (url.includes("tinyman")) return tinymanPool(1_000_000, 132_000);
      if (url.includes("pact")) return pactPoolsResponse([{ address: PACT_ALGO_USDC, price: 0.13, tvlUsd: 150_000 }]);
      if ((init?.body as string | undefined)?.includes("eth_gasPrice")) return rpcGasResponse(20_000_000_000);
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const snapshot = await getArbitrageSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.fetch_warnings.some((w) => w.includes("GeckoTerminal (eth)"))).toBe(true);
    // ALGO/USDC still computable — Tinyman + Pact both up.
    expect(snapshot?.signals.find((s) => s.pair === "ALGO/USDC")).toBeDefined();
  });

  it("returns null when every DEX source is unreachable simultaneously", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 500)),
    );
    const snapshot = await getArbitrageSnapshot();
    expect(snapshot).toBeNull();
  });

  it("returns null (never throws) when every source rejects outright", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    expect(await getArbitrageSnapshot()).toBeNull();
  });

  it("adds a gas_warning and leaves net_spread_pct/signal_quality null when a chain's gas price is unavailable", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/networks/eth/pools/multi/")) return geckoMultiResponse([geckoPool(UNI_ETH_V3, 9.0, 1, 10_000_000), geckoPool(UNI_ETH_V2, 9.03, 1, 1_000_000)]);
      if (url.includes("/networks/arbitrum/pools/multi/")) return geckoMultiResponse([]);
      if (url.includes("/networks/bsc/pools/multi/")) return geckoMultiResponse([]);
      if (url.includes("tinyman")) return jsonResponse({}, 500);
      if (url.includes("pact")) return jsonResponse({}, 500);
      if ((init?.body as string | undefined)?.includes("eth_gasPrice")) return jsonResponse({}, 500); // gas RPC down
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const snapshot = await getArbitrageSnapshot();
    const sig = snapshot?.signals.find((s) => s.pair === "UNI/ETH");
    expect(sig?.net_spread_pct).toBeNull();
    expect(sig?.signal_quality).toBeNull();
    expect(sig?.is_profitable_estimated).toBe(false);
    expect(snapshot?.gas_warnings.some((w) => w.includes("ethereum"))).toBe(true);
  });

  it("caches the snapshot for the 60-second TTL — a second call doesn't re-fetch", async () => {
    const fetchSpy = defaultFetchMock();
    vi.stubGlobal("fetch", fetchSpy);

    await getArbitrageSnapshot();
    const callsAfterFirst = fetchSpy.mock.calls.length;
    await getArbitrageSnapshot();

    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it("never caches a total-outage (null) result — a retry after outage can succeed immediately", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 500)),
    );
    expect(await getArbitrageSnapshot()).toBeNull();

    vi.stubGlobal("fetch", defaultFetchMock());
    expect(await getArbitrageSnapshot()).not.toBeNull();
  });
});

describe("GET /finance/arbitrage-signals", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetDexArbitrageCacheForTests();
  });

  it("returns the full required response shape", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    for (const key of [
      "signals",
      "total_pairs_monitored",
      "pairs_with_signal",
      "covered_dexs",
      "covered_chains",
      "data_currency",
      "cache_ttl_seconds",
      "attribution",
      "stage",
      "stage_note",
      "gas_warnings",
      "fetch_warnings",
      "cached_at",
    ]) {
      expect(body).toHaveProperty(key);
    }
  });

  it("always sets data_currency to real-time", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals");
    const body = (await res.json()) as { data_currency: string };
    expect(body.data_currency).toBe("real-time");
  });

  it("always includes attribution", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals");
    const body = (await res.json()) as { attribution: string };
    expect(body.attribution).toContain("PDC Arbitrage Signal Engine");
  });

  it("always includes fetch_warnings and gas_warnings arrays, even when empty", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals");
    const body = (await res.json()) as { fetch_warnings: unknown[]; gas_warnings: unknown[] };
    expect(Array.isArray(body.fetch_warnings)).toBe(true);
    expect(Array.isArray(body.gas_warnings)).toBe(true);
  });

  it("filters to a known ?pair=", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals?pair=CRV%2FETH");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { signals: Array<{ pair: string }> };
    expect(body.signals.every((s) => s.pair === "CRV/ETH")).toBe(true);
    expect(body.signals.length).toBe(1);
  });

  it("returns 400 for a pair not in the curated list", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals?pair=DOGE%2FUSDC");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("filters by ?chain=arbitrum to only signals touching that chain", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals?chain=arbitrum");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { signals: Array<{ pair: string }> };
    expect(body.signals.map((s) => s.pair)).toEqual(["ETH/USDC"]);
  });

  it("filters by ?chain=algorand", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals?chain=algorand");
    const body = (await res.json()) as { signals: Array<{ pair: string }> };
    expect(body.signals.map((s) => s.pair)).toEqual(["ALGO/USDC"]);
  });

  it("returns 400 for an invalid ?chain=", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals?chain=solana");
    expect(res.status).toBe(400);
  });

  it("filters by ?min_spread_pct= to only signals exceeding the threshold", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals?min_spread_pct=0.5");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { signals: Array<{ pair: string; net_spread_pct: number }> };
    expect(body.signals.every((s) => s.net_spread_pct > 0.5)).toBe(true);
    expect(body.signals.some((s) => s.pair === "CRV/ETH")).toBe(true);
    expect(body.signals.some((s) => s.pair === "ETH/USDC")).toBe(false);
  });

  it("returns 400 for a non-numeric min_spread_pct", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals?min_spread_pct=notanumber");
    expect(res.status).toBe(400);
  });

  it("sets pairs_with_signal to the length of the (possibly filtered) signals array", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals?pair=CRV%2FETH");
    const body = (await res.json()) as { pairs_with_signal: number; signals: unknown[] };
    expect(body.pairs_with_signal).toBe(body.signals.length);
    expect(body.pairs_with_signal).toBe(1);
  });

  it("total_pairs_monitored stays at the full curated count regardless of filtering", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals?pair=CRV%2FETH");
    const body = (await res.json()) as { total_pairs_monitored: number };
    expect(body.total_pairs_monitored).toBe(7);
  });

  it("returns 200 with Cache-Control for a valid request", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("returns 502 (not 500) when every DEX source is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 500)),
    );
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals");
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("bad_gateway");
  });

  it("returns 200 (not 502) for a partial DEX failure", async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/networks/eth/pools/multi/")) return jsonResponse({}, 500);
      if (url.includes("/networks/arbitrum/pools/multi/")) return geckoMultiResponse([]);
      if (url.includes("/networks/bsc/pools/multi/")) return geckoMultiResponse([]);
      if (url.includes("tinyman")) return tinymanPool(1_000_000, 132_000);
      if (url.includes("pact")) return pactPoolsResponse([{ address: PACT_ALGO_USDC, price: 0.13, tvlUsd: 150_000 }]);
      if ((init?.body as string | undefined)?.includes("eth_gasPrice")) return rpcGasResponse(20_000_000_000);
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { fetch_warnings: string[] };
    expect(body.fetch_warnings.length).toBeGreaterThan(0);
  });

  it("stage and stage_note always reflect Stage 1", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals");
    const body = (await res.json()) as { stage: string; stage_note: string };
    expect(body.stage).toBe("1");
    expect(body.stage_note).toContain("Stage 1");
  });

  it("includes a decimal_precision object with a warning field", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals");
    const body = (await res.json()) as { decimal_precision: { warning: string; conversion_formula: string; token_decimals_used: Record<string, number> } };
    expect(body.decimal_precision).toBeDefined();
    expect(body.decimal_precision.warning).toContain("human-readable display units");
    expect(body.decimal_precision.conversion_formula).toContain("10^token_decimals");
  });

  it("includes a top-level decimal_warning string", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals");
    const body = (await res.json()) as { decimal_warning: string };
    expect(body.decimal_warning).toContain("IMPORTANT");
  });

  it("populates token_decimals_used for every token appearing in the response", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals");
    const body = (await res.json()) as { signals: Array<{ base_token: string; quote_token: string }>; decimal_precision: { token_decimals_used: Record<string, number> } };
    const expectedTokens = new Set<string>();
    for (const s of body.signals) {
      expectedTokens.add(s.base_token);
      expectedTokens.add(s.quote_token);
    }
    for (const token of expectedTokens) {
      expect(body.decimal_precision.token_decimals_used).toHaveProperty(token);
    }
  });

  it("USDC always has decimals: 6 in the response", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals?pair=ETH%2FUSDC");
    const body = (await res.json()) as { decimal_precision: { token_decimals_used: Record<string, number> } };
    expect(body.decimal_precision.token_decimals_used.USDC).toBe(6);
  });

  it("ETH always has decimals: 18 in the response", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals?pair=ETH%2FUSDC");
    const body = (await res.json()) as { decimal_precision: { token_decimals_used: Record<string, number> } };
    expect(body.decimal_precision.token_decimals_used.ETH).toBe(18);
  });

  it("ALGO always has decimals: 6 in the response", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals?pair=ALGO%2FUSDC");
    const body = (await res.json()) as { decimal_precision: { token_decimals_used: Record<string, number> } };
    expect(body.decimal_precision.token_decimals_used.ALGO).toBe(6);
  });

  it("each venue includes base_token_decimals and quote_token_decimals", async () => {
    vi.stubGlobal("fetch", defaultFetchMock());
    const app = buildTestApp();
    const res = await app.request("/finance/arbitrage-signals?pair=ETH%2FUSDC");
    const body = (await res.json()) as {
      signals: Array<{ venues: Array<{ base_token_decimals: number; quote_token_decimals: number; base_token_decimals_source: string }> }>;
    };
    const venues = body.signals[0]?.venues ?? [];
    expect(venues.length).toBeGreaterThan(0);
    for (const v of venues) {
      expect(v.base_token_decimals).toBe(18); // ETH
      expect(v.quote_token_decimals).toBe(6); // USDC
      expect(v.base_token_decimals_source).toBe("registry");
    }
  });
});

describe("routeSchemas: /finance/arbitrage-signals payment gate", () => {
  it("is registered as a paid route with the expected Tier 2 price", () => {
    const route = paidRoutes.find((r) => r.path === "/finance/arbitrage-signals" && r.method === "GET");
    expect(route).toBeDefined();
    expect(route?.priceUsdc).toBe(0.05);
    expect(route?.payToAddress).toBeTruthy();
  });
});
