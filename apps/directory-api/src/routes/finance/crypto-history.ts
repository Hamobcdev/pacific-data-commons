import { Hono } from "hono";
import { queryCryptoHistory } from "../../services/pacificCryptoHistoryService.js";
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
//
// Validation + KV windowing live in
// services/pacificCryptoHistoryService.ts's queryCryptoHistory() so the
// Agent Dataset Gateway's query adapter can reuse it.
export const pacificCryptoHistoryRoute = new Hono<AppBindings>();

pacificCryptoHistoryRoute.get("/finance/crypto-history", async (c) => {
  const result = await queryCryptoHistory({ symbol: c.req.query("symbol"), tf: c.req.query("tf") }, c.get("cryptoPricesKv"));

  c.header("Cache-Control", "public, max-age=60");
  return c.json(result);
});
