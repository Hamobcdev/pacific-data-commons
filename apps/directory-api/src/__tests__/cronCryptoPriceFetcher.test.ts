import { afterEach, describe, expect, it, vi } from "vitest";
import { runCronCryptoPriceFetch, type CryptoRate } from "../handlers/cronCryptoPriceFetcher.js";
import { createFakeKv, getFakeKvStore } from "./testUtils.js";
import type { Env } from "../lib/env.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

// Kraken's real /0/public/Ticker shape: c = [last trade closed price, lot
// volume], o = today's opening price, v = [today's volume, last 24h
// volume]. change_24h_pct is computed from (c[0]-o)/o*100, so these values
// are chosen to produce the clean percentages asserted below (ALGO +2.5%,
// BTC +5%, ETH +4%, XRP +2%, XLM +5%, USDC/USDT flat).
const KRAKEN_SUCCESS_RESPONSE = {
  error: [] as string[],
  result: {
    ALGOUSD: { c: ["0.123", "1000"], o: "0.12", v: ["900000", "1000000"] },
    XXBTZUSD: { c: ["84000", "1"], o: "80000", v: ["400", "500"] },
    XETHZUSD: { c: ["2600", "10"], o: "2500", v: ["2800", "3000"] },
    XXRPZUSD: { c: ["1.53", "2000"], o: "1.5", v: ["1900000", "2000000"] },
    XXLMZUSD: { c: ["0.21", "5000"], o: "0.2", v: ["480000", "500000"] },
    USDCUSD: { c: ["1.0", "1000"], o: "1.0", v: ["9000000", "10000000"] },
    USDTZUSD: { c: ["1.0", "1000"], o: "1.0", v: ["8000000", "9000000"] },
  },
};

// CoinCap's real /v2/assets shape — fetchFromCoinCap() tolerates a partial
// asset list (only needs rates.size > 0), so this intentionally omits
// usd-coin/tether, same as the fixture this replaced.
const FULL_COINCAP_ASSETS = {
  data: [
    { id: "algorand", priceUsd: "0.1323", changePercent24Hr: "2.5", marketCapUsd: "1000000000", volumeUsd24Hr: "50000000" },
    { id: "bitcoin", priceUsd: "86438", changePercent24Hr: "1.1", marketCapUsd: "1700000000000", volumeUsd24Hr: "30000000000" },
    { id: "ethereum", priceUsd: "2728", changePercent24Hr: "-0.4", marketCapUsd: "330000000000", volumeUsd24Hr: "15000000000" },
    { id: "ripple", priceUsd: "1.52", changePercent24Hr: "0.9", marketCapUsd: "90000000000", volumeUsd24Hr: "3000000000" },
    { id: "stellar", priceUsd: "0.223", changePercent24Hr: "3.2", marketCapUsd: "7000000000", volumeUsd24Hr: "200000000" },
  ],
};

function dummyRate(symbol: string, index: number, overrides: Partial<CryptoRate> = {}): CryptoRate {
  return {
    symbol,
    price_usd: 0.1,
    change_24h_pct: 0,
    volume_24h: 0,
    market_cap_usd: 0,
    last_updated: new Date(index * 300_000).toISOString(),
    source: "kraken",
    ...overrides,
  };
}

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

  it("writes prices:current as a flat Record<symbol, CryptoRate> from Kraken when every curated pair succeeds", async () => {
    stubFetchByUrl({
      "api.kraken.com": () => jsonResponse(KRAKEN_SUCCESS_RESPONSE),
      "api.coincap.io": () => {
        throw new Error("CoinCap should not be called when Kraken succeeds");
      },
    });
    const kv = createFakeKv();

    await runCronCryptoPriceFetch({} as Env, kv);

    const store = getFakeKvStore(kv);
    const record = JSON.parse(store.get("prices:current")!) as Record<string, CryptoRate>;
    expect(Object.keys(record).sort()).toEqual(["ALGO", "BTC", "ETH", "USDC", "USDT", "XLM", "XRP"]);

    expect(record.ALGO?.source).toBe("kraken");
    expect(record.ALGO?.price_usd).toBe(0.123);
    expect(record.ALGO?.change_24h_pct).toBe(2.5);

    expect(record.USDC?.price_usd).toBe(1.0);
    expect(record.USDC?.change_24h_pct).toBe(0);
  });

  it("falls back to CoinCap when Kraken returns no data for any curated pair", async () => {
    stubFetchByUrl({
      "api.kraken.com": () => jsonResponse({ error: [], result: {} }),
      "api.coincap.io": () => jsonResponse(FULL_COINCAP_ASSETS),
    });
    const kv = createFakeKv();

    await runCronCryptoPriceFetch({} as Env, kv);

    const store = getFakeKvStore(kv);
    const record = JSON.parse(store.get("prices:current")!) as Record<string, CryptoRate>;
    expect(record.ALGO?.source).toBe("coincap");
    expect(record.XLM?.price_usd).toBe(0.223);
    expect(record.XLM?.market_cap_usd).toBe(7000000000);
  });

  it("falls back to CoinCap when the Kraken fetch rejects outright", async () => {
    stubFetchByUrl({
      "api.kraken.com": () => {
        throw new Error("network error");
      },
      "api.coincap.io": () => jsonResponse(FULL_COINCAP_ASSETS),
    });
    const kv = createFakeKv();

    await runCronCryptoPriceFetch({} as Env, kv);

    const store = getFakeKvStore(kv);
    const record = JSON.parse(store.get("prices:current")!) as Record<string, CryptoRate>;
    expect(record.ALGO?.source).toBe("coincap");
  });

  it("never fabricates market_cap_usd for a Kraken-sourced token (volume_24h is a real fetched value, not zeroed)", async () => {
    stubFetchByUrl({ "api.kraken.com": () => jsonResponse(KRAKEN_SUCCESS_RESPONSE) });
    const kv = createFakeKv();

    await runCronCryptoPriceFetch({} as Env, kv);

    const record = JSON.parse(getFakeKvStore(kv).get("prices:current")!) as Record<string, CryptoRate>;
    expect(record.BTC?.market_cap_usd).toBe(0); // Kraken's ticker endpoint has no market cap data
    expect(record.BTC?.volume_24h).toBe(500); // genuinely fetched, not fabricated
  });

  it("does NOT write to KV when both Kraken and CoinCap fail — existing live prices are preserved", async () => {
    const existing = JSON.stringify({ ALGO: dummyRate("ALGO", 0, { price_usd: 0.5, source: "kraken" }) });
    const kv = createFakeKv({ "prices:current": existing });
    stubFetchByUrl({
      "api.kraken.com": () => jsonResponse([], 500),
      "api.coincap.io": () => jsonResponse([], 500),
    });

    await runCronCryptoPriceFetch({} as Env, kv);

    const store = getFakeKvStore(kv);
    expect(store.get("prices:current")).toBe(existing);
    expect(store.has("history:ALGO")).toBe(false);
  });

  it("appends one point per symbol to history:{SYMBOL} as CryptoRate objects, creating the array on first run", async () => {
    stubFetchByUrl({ "api.kraken.com": () => jsonResponse(KRAKEN_SUCCESS_RESPONSE) });
    const kv = createFakeKv();

    await runCronCryptoPriceFetch({} as Env, kv);

    const store = getFakeKvStore(kv);
    const algoHistory = JSON.parse(store.get("history:ALGO")!) as CryptoRate[];
    expect(algoHistory).toHaveLength(1);
    expect(algoHistory[0]?.price_usd).toBe(0.123);
    expect(typeof algoHistory[0]?.last_updated).toBe("string");

    const usdcHistory = JSON.parse(store.get("history:USDC")!) as CryptoRate[];
    expect(usdcHistory).toHaveLength(1);
    expect(usdcHistory[0]?.price_usd).toBe(1.0);
  });

  it("caps history:{SYMBOL} at 288 points, dropping the oldest", async () => {
    const existing: CryptoRate[] = Array.from({ length: 288 }, (_, i) => dummyRate("ALGO", i));
    const kv = createFakeKv({ "history:ALGO": JSON.stringify(existing) });
    stubFetchByUrl({ "api.kraken.com": () => jsonResponse(KRAKEN_SUCCESS_RESPONSE) });

    await runCronCryptoPriceFetch({} as Env, kv);

    const store = getFakeKvStore(kv);
    const algoHistory = JSON.parse(store.get("history:ALGO")!) as CryptoRate[];
    expect(algoHistory).toHaveLength(288);
    expect(algoHistory[0]?.last_updated).toBe(dummyRate("ALGO", 1).last_updated); // index 0 (oldest) was dropped
    expect(algoHistory[287]?.price_usd).toBe(0.123); // newly appended point
  });
});
