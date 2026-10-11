import { Hono } from "hono";
import { queryArbitrageSignals } from "../../services/pacificDexArbitrageService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 2 / $0.05, Decisions 59/60 — a
// first-party utility wrapper over GeckoTerminal/Tinyman/Pact's already-
// openly-accessible public APIs, not a paywall on the underlying data).
// See services/pacificDexArbitrageService.ts for the full sourcing doc
// comment, including why 4 of the 6 originally-named DEX sources and 3
// of the 5 originally-named gas sources turned out to be dead, and why
// the curated pair list is 7, not the 16 originally proposed.
//
// Unlike every other first-party endpoint in this codebase, this one
// never 502s for a partial upstream failure — only when EVERY DEX source
// is unreachable simultaneously (see queryArbitrageSignals()'s own
// doc comment: a GeckoTerminal fetch failure alone, with Tinyman/Pact
// still working, still returns 200 with whatever signals survived, same
// posture the brief's own INTEGRITY RULES specify).
//
// Query params (all optional):
//   pair — one curated pair, e.g. ?pair=ETH/USDC. 400 if not curated.
//   min_spread_pct — only return signals whose net_spread_pct exceeds
//     this (default 0). A signal with net_spread_pct: null (gas data
//     unavailable this cycle) is excluded by any threshold > 0, since
//     "exceeds an unknown value" can't be asserted true.
//   chain — filter to signals where this chain appears as either the
//     buy or sell chain. One of: ethereum, arbitrum, bnb, polygon,
//     algorand. 400 for any other value.
//
// Validation + filtering live in pacificDexArbitrageService.ts's
// queryArbitrageSignals() so the Agent Dataset Gateway's query adapter
// can reuse it.
export const pacificDexArbitrageRoute = new Hono<AppBindings>();

pacificDexArbitrageRoute.get("/finance/arbitrage-signals", async (c) => {
  const result = await queryArbitrageSignals({
    pair: c.req.query("pair"),
    chain: c.req.query("chain"),
    minSpreadPct: c.req.query("min_spread_pct"),
  });

  c.header("Cache-Control", "public, max-age=60");
  return c.json(result);
});
