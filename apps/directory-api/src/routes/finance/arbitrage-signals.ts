import { Hono } from "hono";
import { getArbitrageSnapshot, CURATED_PAIRS, COVERED_DEXS, COVERED_CHAINS, SOURCE_ATTRIBUTION, type Chain, type ArbitrageSignal } from "../../services/pacificDexArbitrageService.js";
import { AppError, ValidationError } from "../../lib/errors.js";
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
// is unreachable simultaneously (checked below: a GeckoTerminal fetch
// failure alone, with Tinyman/Pact still working, still returns 200 with
// whatever signals survived, same posture the brief's own INTEGRITY
// RULES specify).
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
export const pacificDexArbitrageRoute = new Hono<AppBindings>();

pacificDexArbitrageRoute.get("/finance/arbitrage-signals", async (c) => {
  const pairRaw = c.req.query("pair");
  if (pairRaw !== undefined && !CURATED_PAIRS.some((p) => p.pair === pairRaw)) {
    throw new ValidationError(`pair must be one of the curated pairs: ${CURATED_PAIRS.map((p) => p.pair).join(", ")} (got "${pairRaw}")`);
  }

  const chainRaw = c.req.query("chain");
  if (chainRaw !== undefined && !(COVERED_CHAINS as readonly string[]).includes(chainRaw)) {
    throw new ValidationError(`chain must be one of: ${COVERED_CHAINS.join(", ")} (got "${chainRaw}")`);
  }
  const chain = chainRaw as Chain | undefined;

  const minSpreadRaw = c.req.query("min_spread_pct");
  let minSpreadPct = 0;
  if (minSpreadRaw !== undefined) {
    minSpreadPct = Number(minSpreadRaw);
    if (!Number.isFinite(minSpreadPct)) {
      throw new ValidationError("min_spread_pct must be a number");
    }
  }

  // Only 502s when EVERY DEX source failed simultaneously (see
  // getArbitrageSnapshot's own doc comment) — a partial failure still
  // returns 200 with whatever signals survived, per this endpoint's own
  // integrity rules.
  const snapshot = await getArbitrageSnapshot();
  if (!snapshot) {
    throw new AppError(502, "bad_gateway", "All DEX data sources are unreachable. Try again shortly.");
  }

  let signals: ArbitrageSignal[] = snapshot.signals;

  if (pairRaw) {
    signals = signals.filter((s) => s.pair === pairRaw);
  }
  if (chain) {
    signals = signals.filter((s) => s.estimated_gas.buy_chain === chain || s.estimated_gas.sell_chain === chain);
  }
  if (minSpreadPct > 0) {
    signals = signals.filter((s) => s.net_spread_pct !== null && s.net_spread_pct > minSpreadPct);
  }

  c.header("Cache-Control", "public, max-age=60");

  return c.json({
    signals,
    total_pairs_monitored: snapshot.total_pairs_monitored,
    pairs_with_signal: signals.length,
    covered_dexs: COVERED_DEXS,
    covered_chains: COVERED_CHAINS,
    data_currency: "real-time",
    cache_ttl_seconds: 60,
    attribution: SOURCE_ATTRIBUTION,
    stage: "1",
    stage_note: "Stage 1: curated pairs only. Stage 2 will add on-demand arbitrary pair lookup.",
    gas_warnings: snapshot.gas_warnings,
    fetch_warnings: snapshot.fetch_warnings,
    cached_at: snapshot.cached_at,
  });
});
