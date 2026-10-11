import { Hono } from "hono";
import { queryCryptoRates } from "../../services/pacificCryptoRatesService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 1 / $0.001, Decisions 59/60 — a
// first-party utility wrapper over CoinGecko's already-openly-accessible
// free public API, not a paywall on the underlying data). See
// services/pacificCryptoRatesService.ts for the full sourcing/caching
// doc comment, including why the curated list is 67 tokens, not the 75
// named in this route's build brief.
//
// Query params (both optional):
//   symbols — comma-separated, case-insensitive, e.g. ?symbols=BTC,ETH,ALGO.
//     Filters to the matching curated tokens. 400 only if every
//     requested symbol is outside the curated list — a mix of valid and
//     unrecognised symbols silently filters to the valid ones.
//   category — one of defi|l1|l2|pacific. 400 for any other value.
// If both are given, category is applied first, then symbols on top.
//
// Validation + filtering live in pacificCryptoRatesService.ts's
// queryCryptoRates() so the Agent Dataset Gateway's query adapter can
// reuse it.
export const pacificCryptoRatesRoute = new Hono<AppBindings>();

pacificCryptoRatesRoute.get("/finance/crypto-rates", async (c) => {
  // Never 502s a buyer who already paid for this query (Decision 59/60) —
  // getCryptoRatesSnapshot() itself serves a static fallback rather than
  // null when neither the KV live feed nor CoinGecko is reachable, see
  // queryCryptoRates()'s own call into it. cryptoPricesKv is undefined on
  // Node local dev (no Workers bindings) — handled the same way it always
  // has been.
  const result = await queryCryptoRates({ category: c.req.query("category"), symbols: c.req.query("symbols") }, c.get("cryptoPricesKv"));

  // 60-second cache, same value mirrored here as a standard HTTP cache
  // hint (pacificCryptoRatesService.ts's doc comment has the TTL
  // reasoning).
  c.header("Cache-Control", "public, max-age=60");

  return c.json(result);
});
