import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { pacificCryptoHistoryRoute } from "../routes/finance/crypto-history.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { createFakeKv } from "./testUtils.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { CryptoRate, HistoryPoint } from "../handlers/cronCryptoPriceFetcher.js";

function buildTestApp(kv?: KVNamespace) {
  const app = new Hono<AppBindings>();
  const env = {} as Env;
  app.use("*", async (c, next) => {
    c.set("env", env);
    c.set("cryptoPricesKv", kv);
    await next();
  });
  app.route("/", pacificCryptoHistoryRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

// history:{symbol} is written by cronCryptoPriceFetcher.ts as CryptoRate[]
// (see that file + crypto-history.ts's read-side mapping), not
// HistoryPoint[] directly — these fixtures mirror the real stored shape.
function rates(count: number): CryptoRate[] {
  return Array.from({ length: count }, (_, i) => ({
    symbol: "TEST",
    price_usd: 0.1 + i * 0.0001,
    change_24h_pct: 0,
    volume_24h: 0,
    market_cap_usd: 0,
    last_updated: new Date(i * 300_000).toISOString(),
    source: "kraken",
  }));
}

describe("GET /finance/crypto-history", () => {
  it("returns 400 when symbol is missing", async () => {
    const app = buildTestApp(createFakeKv());
    const res = await app.request("/finance/crypto-history");
    expect(res.status).toBe(400);
  });

  it("returns 400 for a symbol outside the tracked set", async () => {
    const app = buildTestApp(createFakeKv());
    const res = await app.request("/finance/crypto-history?symbol=DOGE");
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unrecognised tf value", async () => {
    const app = buildTestApp(createFakeKv());
    const res = await app.request("/finance/crypto-history?symbol=ALGO&tf=3h");
    expect(res.status).toBe(400);
  });

  it("defaults to tf=1D and returns all available points, case-insensitive symbol", async () => {
    const kv = createFakeKv({ "history:ALGO": JSON.stringify(rates(50)) });
    const app = buildTestApp(kv);
    const res = await app.request("/finance/crypto-history?symbol=algo");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { symbol: string; timeframe: string; points: HistoryPoint[]; point_count: number };
    expect(body.symbol).toBe("ALGO");
    expect(body.timeframe).toBe("1D");
    expect(body.point_count).toBe(50);
  });

  it("windows to the last N points per timeframe", async () => {
    const kv = createFakeKv({ "history:BTC": JSON.stringify(rates(288)) });
    const app = buildTestApp(kv);

    const res1h = await app.request("/finance/crypto-history?symbol=BTC&tf=1h");
    const body1h = (await res1h.json()) as { points: HistoryPoint[] };
    expect(body1h.points).toHaveLength(12);

    const res5m = await app.request("/finance/crypto-history?symbol=BTC&tf=5m");
    const body5m = (await res5m.json()) as { points: HistoryPoint[] };
    expect(body5m.points).toHaveLength(1);
    // The most recent point, not the oldest.
    expect(body5m.points[0]?.t).toBe(new Date(287 * 300_000).toISOString());
  });

  it("returns everything available (not a 400) for 1W/1M, with an explanatory note", async () => {
    const kv = createFakeKv({ "history:ETH": JSON.stringify(rates(288)) });
    const app = buildTestApp(kv);

    const res = await app.request("/finance/crypto-history?symbol=ETH&tf=1W");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { points: HistoryPoint[]; note: string | null };
    expect(body.points).toHaveLength(288);
    expect(body.note).toContain("7 days");
  });

  it("returns a null note for ordinary timeframes", async () => {
    const kv = createFakeKv({ "history:ETH": JSON.stringify(rates(10)) });
    const app = buildTestApp(kv);
    const res = await app.request("/finance/crypto-history?symbol=ETH&tf=1h");
    const body = (await res.json()) as { note: string | null };
    expect(body.note).toBeNull();
  });

  it("returns 200 with an empty points array (never an error) when no KV binding is present", async () => {
    const app = buildTestApp(undefined);
    const res = await app.request("/finance/crypto-history?symbol=ALGO");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { points: HistoryPoint[]; max_available_points: number };
    expect(body.points).toEqual([]);
    expect(body.max_available_points).toBe(0);
  });

  it("returns 200 with an empty points array when the symbol has no history yet", async () => {
    const app = buildTestApp(createFakeKv());
    const res = await app.request("/finance/crypto-history?symbol=USDT");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { points: HistoryPoint[] };
    expect(body.points).toEqual([]);
  });

  it("sets Cache-Control for a valid request", async () => {
    const app = buildTestApp(createFakeKv({ "history:XRP": JSON.stringify(rates(3)) }));
    const res = await app.request("/finance/crypto-history?symbol=XRP");
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });
});
