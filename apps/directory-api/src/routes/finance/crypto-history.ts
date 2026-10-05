import { Hono } from "hono";
import { ValidationError } from "../../lib/errors.js";
import type { CryptoRate, HistoryPoint } from "../../handlers/cronCryptoPriceFetcher.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 1 / $0.001, same tier as
// /finance/crypto-rates — this route serves the same KV-backed data, just
// windowed into a time series for the dashboard's timeframe chart
// selector). Dashboard-bypass eligible (middleware/dashboardBypass.ts).
//
// GET /finance/crypto-history?symbol=ALGO&tf=1D
//   symbol — required, one of the 7 symbols the cron fetcher tracks
//     (handlers/cronCryptoPriceFetcher.ts): ALGO, BTC, ETH, XRP, XLM,
//     USDC, USDT. 400 for anything else.
//   tf     — optional, default "1D". One of 5m|15m|1h|4h|8h|1D|1W|1M.
//     Windows the "history:{symbol}" KV array (appended to every 5
//     minutes by the cron fetcher, capped at 288 points = 24h) to the
//     requested recency. 1W/1M literally need 7/30 days of history this
//     24h buffer doesn't hold yet — rather than 400 or fabricate older
//     points, these two return every point the buffer currently has
//     (identical to 1D) plus a `note` explaining the shortfall, so the
//     chart always renders something real instead of erroring on a
//     perfectly valid timeframe value.
export const pacificCryptoHistoryRoute = new Hono<AppBindings>();

const TRACKED_SYMBOLS = new Set(["ALGO", "BTC", "ETH", "XRP", "XLM", "USDC", "USDT"]);

type Timeframe = "5m" | "15m" | "1h" | "4h" | "8h" | "1D" | "1W" | "1M";

// Point counts assume the cron's fixed 5-minute interval (24 * 60 / 5 = 288
// points/day). 1W/1M are capped at the same 288 the buffer actually holds
// — see the route doc comment above for why that's a `note`, not a 400.
const TIMEFRAME_POINTS: Record<Timeframe, number> = {
  "5m": 1,
  "15m": 3,
  "1h": 12,
  "4h": 48,
  "8h": 96,
  "1D": 288,
  "1W": 288,
  "1M": 288,
};

const LONG_RANGE_NOTE: Record<"1W" | "1M", string> = {
  "1W": "1W requests 7 days of history; the KV history buffer currently retains at most 24h (288 points at 5-minute intervals) — returning everything available instead.",
  "1M": "1M requests 30 days of history; the KV history buffer currently retains at most 24h (288 points at 5-minute intervals) — returning everything available instead.",
};

pacificCryptoHistoryRoute.get("/finance/crypto-history", async (c) => {
  const symbol = c.req.query("symbol")?.toUpperCase();
  if (!symbol) {
    throw new ValidationError("symbol query parameter is required, e.g. ?symbol=ALGO");
  }
  if (!TRACKED_SYMBOLS.has(symbol)) {
    throw new ValidationError(`"${symbol}" is not a tracked symbol. Supported: ${Array.from(TRACKED_SYMBOLS).join(", ")}`);
  }

  const tfRaw = c.req.query("tf") ?? "1D";
  if (!Object.prototype.hasOwnProperty.call(TIMEFRAME_POINTS, tfRaw)) {
    throw new ValidationError(`tf must be one of: ${Object.keys(TIMEFRAME_POINTS).join(", ")} (got "${tfRaw}")`);
  }
  const tf = tfRaw as Timeframe;

  // No KV binding (Node local dev) or no history written yet both mean
  // "nothing to window" — 200 with an empty array, same never-502 posture
  // as /finance/crypto-rates, not an error.
  //
  // history:{symbol} is written by cronCryptoPriceFetcher.ts as
  // CryptoRate[] (the same shape as prices:current's per-symbol entries),
  // not HistoryPoint[] — mapped here, read-side only, into the {t, p}
  // shape the dashboard's chart actually wants: t = last_updated (ISO),
  // p = price_usd.
  const kv = c.get("cryptoPricesKv");
  const storedRates: CryptoRate[] = kv ? ((await kv.get<CryptoRate[]>(`history:${symbol}`, { type: "json" })) ?? []) : [];
  const allPoints: HistoryPoint[] = storedRates.map((rate) => ({ t: rate.last_updated, p: rate.price_usd }));

  const windowSize = TIMEFRAME_POINTS[tf];
  const points = allPoints.slice(-windowSize);

  c.header("Cache-Control", "public, max-age=60");

  return c.json({
    symbol,
    timeframe: tf,
    points,
    point_count: points.length,
    max_available_points: allPoints.length,
    note: tf === "1W" || tf === "1M" ? LONG_RANGE_NOTE[tf] : null,
  });
});
