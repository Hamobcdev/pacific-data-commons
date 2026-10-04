import { Hono } from "hono";
import {
  getArbitrageSnapshot,
  CURATED_PAIRS,
  COVERED_DEXS,
  COVERED_CHAINS,
  SOURCE_ATTRIBUTION,
  resolveTokenDecimals,
  ASSUMED_TRADE_SIZE_USD,
  type Chain,
  type ArbitrageSignal,
} from "../../services/pacificDexArbitrageService.js";
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

  // Every token actually present in the (possibly filtered) response —
  // not the full curated set — so a ?pair= or ?chain=-narrowed response
  // only advertises decimals for tokens it actually returned.
  const tokensInResponse = new Set<string>();
  for (const signal of signals) {
    tokensInResponse.add(signal.base_token);
    tokensInResponse.add(signal.quote_token);
  }
  const tokenDecimalsUsed: Record<string, number> = {};
  for (const token of tokensInResponse) {
    tokenDecimalsUsed[token] = resolveTokenDecimals(token).decimals;
  }

  // signal_age_ms must be computed here, at response time, not stored on
  // the cached signal — a signal's underlying prices were fetched once
  // (observed_at, fixed for the life of the 60s cache), but its AGE
  // grows with every subsequent request served from that same cache
  // entry. Baking a fixed number into the cached object would make it
  // wrong for every response after the first.
  const signalsWithAge = signals.map((s) => ({ ...s, signal_age_ms: Date.now() - new Date(s.observed_at).getTime() }));

  c.header("Cache-Control", "public, max-age=60");

  return c.json({
    signals: signalsWithAge,
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
    decimal_precision: {
      warning:
        "All prices and amounts in this response are human-readable display units. Always convert to raw on-chain integer units using token decimal precision before constructing swap transactions or smart contract calls.",
      conversion_formula: "raw_units = display_amount * 10^token_decimals (use integer arithmetic, never float — float precision loss causes transaction errors)",
      example_usdc: "1.5 USDC display → 1500000 raw units (6 decimals)",
      example_eth: "1.5 ETH display → 1500000000000000000 raw units (18 decimals)",
      token_decimals_used: tokenDecimalsUsed,
    },
    decimal_warning:
      "IMPORTANT: spot_price_usd and liquidity_usd are display units. For on-chain use apply token_decimals from decimal_precision.token_decimals_used before constructing transactions.",
    benchmark_trade_size_usd: ASSUMED_TRADE_SIZE_USD,
    benchmark_trade_note:
      "Slippage and execution estimates assume a $10,000 benchmark trade. Larger trades will experience greater slippage and may not be profitable at the indicated spread.",
    cached_at: snapshot.cached_at,
  });
});
