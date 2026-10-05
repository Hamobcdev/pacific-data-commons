import { afterEach, describe, expect, it, vi } from "vitest";
import { runCronCryptoPriceFetch, type HistoryPoint } from "../handlers/cronCryptoPriceFetcher.js";
import type { CryptoPriceCronRecord, CryptoToken } from "../services/pacificCryptoRatesService.js";
import { createFakeKv, getFakeKvStore } from "./testUtils.js";
import type { Env } from "../lib/env.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const FULL_BINANCE_TICKERS = [
  { symbol: "ALGOUSDT", lastPrice: "0.1323", priceChangePercent: "2.5" },
  { symbol: "BTCUSDT", lastPrice: "86438", priceChangePercent: "1.1" },
  { symbol: "ETHUSDT", lastPrice: "2728", priceChangePercent: "-0.4" },
  { symbol: "XRPUSDT", lastPrice: "1.52", priceChangePercent: "0.9" },
  { symbol: "XLMUSDT", lastPrice: "0.223", priceChangePercent: "3.2" },
  // Noise — a real Binance response has thousands of unrelated pairs.
  { symbol: "DOGEUSDT", lastPrice: "0.2", priceChangePercent: "0.1" },
];

const FULL_COINCAP_ASSETS = {
  data: [
    { id: "algorand", priceUsd: "0.1323", changePercent24Hr: "2.5", marketCapUsd: "1000000000", volumeUsd24Hr: "50000000", rank: "34" },
    { id: "bitcoin", priceUsd: "86438", changePercent24Hr: "1.1", marketCapUsd: "1700000000000", volumeUsd24Hr: "30000000000", rank: "1" },
    { id: "ethereum", priceUsd: "2728", changePercent24Hr: "-0.4", marketCapUsd: "330000000000", volumeUsd24Hr: "15000000000", rank: "2" },
    { id: "ripple", priceUsd: "1.52", changePercent24Hr: "0.9", marketCapUsd: "90000000000", volumeUsd24Hr: "3000000000", rank: "5" },
    { id: "stellar", priceUsd: "0.223", changePercent24Hr: "3.2", marketCapUsd: "7000000000", volumeUsd24Hr: "200000000", rank: "20" },
  ],
};

function stubFetchByUrl(handlers: Record<string, () => Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      for (const [match, handler] of Object.entries(handlers)) {
        if (url.includes(match)) return handler();
      }
      throw new Error(`Unexpected fetch in test: ${url}`);
    }),
  );
}

describe("runCronCryptoPriceFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes prices:current from Binance when Binance returns every curated pair", async () => {
    stubFetchByUrl({
      "api.binance.com": () => jsonResponse(FULL_BINANCE_TICKERS),
      "api.coincap.io": () => {
        throw new Error("CoinCap should not be called when Binance succeeds");
      },
    });
    const kv = createFakeKv();

    await runCronCryptoPriceFetch({} as Env, kv);

    const store = getFakeKvStore(kv);
    const record = JSON.parse(store.get("prices:current")!) as CryptoPriceCronRecord;
    expect(record.source).toBe("binance");
    expect(record.static_fallback).toBe(false);
    expect(record.tokens.map((t) => t.symbol).sort()).toEqual(["ALGO", "BTC", "ETH", "USDC", "USDT", "XLM", "XRP"]);

    const algo = record.tokens.find((t) => t.symbol === "ALGO") as CryptoToken;
    expect(algo.price_usd).toBe(0.1323);
    expect(algo.change_24h_pct).toBe(2.5);

    const usdc = record.tokens.find((t) => t.symbol === "USDC") as CryptoToken;
    expect(usdc.price_usd).toBe(1.0);
    expect(usdc.change_24h_pct).toBe(0);
  });

  it("falls back to CoinCap when Binance is missing one of the curated pairs", async () => {
    stubFetchByUrl({
      // XLMUSDT missing -> Binance treated as a failed source entirely.
      "api.binance.com": () => jsonResponse(FULL_BINANCE_TICKERS.filter((t) => t.symbol !== "XLMUSDT")),
      "api.coincap.io": () => jsonResponse(FULL_COINCAP_ASSETS),
    });
    const kv = createFakeKv();

    await runCronCryptoPriceFetch({} as Env, kv);

    const store = getFakeKvStore(kv);
    const record = JSON.parse(store.get("prices:current")!) as CryptoPriceCronRecord;
    expect(record.source).toBe("coincap");
    const xlm = record.tokens.find((t) => t.symbol === "XLM") as CryptoToken;
    expect(xlm.price_usd).toBe(0.223);
    expect(xlm.market_cap_rank).toBe(20);
  });

  it("falls back to CoinCap when the Binance fetch rejects outright", async () => {
    stubFetchByUrl({
      "api.binance.com": () => {
        throw new Error("network error");
      },
      "api.coincap.io": () => jsonResponse(FULL_COINCAP_ASSETS),
    });
    const kv = createFakeKv();

    await runCronCryptoPriceFetch({} as Env, kv);

    const store = getFakeKvStore(kv);
    const record = JSON.parse(store.get("prices:current")!) as CryptoPriceCronRecord;
    expect(record.source).toBe("coincap");
  });

  it("never fabricates market_cap_usd/volume_24h_usd/market_cap_rank for a Binance-sourced token", async () => {
    stubFetchByUrl({ "api.binance.com": () => jsonResponse(FULL_BINANCE_TICKERS) });
    const kv = createFakeKv();

    await runCronCryptoPriceFetch({} as Env, kv);

    const record = JSON.parse(getFakeKvStore(kv).get("prices:current")!) as CryptoPriceCronRecord;
    const btc = record.tokens.find((t) => t.symbol === "BTC") as CryptoToken;
    expect(btc.market_cap_usd).toBe(0);
    expect(btc.volume_24h_usd).toBe(0);
    expect(btc.market_cap_rank).toBeNull();
  });

  it("does NOT write to KV when both Binance and CoinCap fail — existing live prices are preserved", async () => {
    const kv = createFakeKv({
      "prices:current": JSON.stringify({ updated_at: "2026-10-01T00:00:00.000Z", source: "binance", static_fallback: false, tokens: [] }),
    });
    stubFetchByUrl({
      "api.binance.com": () => jsonResponse([], 500),
      "api.coincap.io": () => jsonResponse([], 500),
    });

    await runCronCryptoPriceFetch({} as Env, kv);

    const store = getFakeKvStore(kv);
    expect(store.get("prices:current")).toBe(
      JSON.stringify({ updated_at: "2026-10-01T00:00:00.000Z", source: "binance", static_fallback: false, tokens: [] }),
    );
    expect(store.has("history:ALGO")).toBe(false);
  });

  it("appends one point per symbol to history:{SYMBOL}, creating the array on first run", async () => {
    stubFetchByUrl({ "api.binance.com": () => jsonResponse(FULL_BINANCE_TICKERS) });
    const kv = createFakeKv();

    await runCronCryptoPriceFetch({} as Env, kv);

    const store = getFakeKvStore(kv);
    const algoHistory = JSON.parse(store.get("history:ALGO")!) as HistoryPoint[];
    expect(algoHistory).toHaveLength(1);
    expect(algoHistory[0]?.p).toBe(0.1323);
    expect(typeof algoHistory[0]?.t).toBe("number");

    const usdcHistory = JSON.parse(store.get("history:USDC")!) as HistoryPoint[];
    expect(usdcHistory).toHaveLength(1);
    expect(usdcHistory[0]?.p).toBe(1.0);
  });

  it("caps history:{SYMBOL} at 288 points, dropping the oldest", async () => {
    const existing: HistoryPoint[] = Array.from({ length: 288 }, (_, i) => ({ t: i, p: 0.1 }));
    const kv = createFakeKv({ "history:ALGO": JSON.stringify(existing) });
    stubFetchByUrl({ "api.binance.com": () => jsonResponse(FULL_BINANCE_TICKERS) });

    await runCronCryptoPriceFetch({} as Env, kv);

    const store = getFakeKvStore(kv);
    const algoHistory = JSON.parse(store.get("history:ALGO")!) as HistoryPoint[];
    expect(algoHistory).toHaveLength(288);
    expect(algoHistory[0]?.t).toBe(1); // point at index 0 (t: 0) was dropped
    expect(algoHistory[287]?.p).toBe(0.1323); // newly appended point
  });
});
