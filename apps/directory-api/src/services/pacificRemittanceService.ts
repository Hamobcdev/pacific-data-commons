// pacificRemittanceService.ts
//
// Pacific remittance corridor cost comparison: traditional-rail cost
// (World Bank Remittance Prices Worldwide) vs. crypto-rail network-fee
// estimates, for 9 Australia/New Zealand/USA -> Pacific Island corridors.
// Consumes fxRateService.ts internally (in-process, via its existing
// public getFxRates conversion feature — not a new HTTP round trip) for
// each corridor's live cross-rate.
//
// IMPORTANT — World Bank's Remittance Prices Worldwide API
// (remittanceprices.worldbank.org) is confirmed live, during this
// session AND confirmed separately from this app's actual Render
// deployment, to be ENTIRELY Cloudflare bot-challenge-gated for
// server-side requests: the bare root domain, the bare API path with no
// query string, and the documented ?iso3= query all return the same
// "Just a moment..." challenge page (HTTP 403), with or without a
// browser User-Agent. This is not a partial or corridor-specific gap —
// the live fetch fails for every corridor.
//
// fetchWorldBankCorridor below still makes a real fetch attempt on every
// cache miss (not a permanently-disabled code path) — Cloudflare's
// challenge could in principle stop applying to this specific server
// identity in the future, and if it ever does, live data takes priority
// over the static fallback below (see deriveTraditionalRails). The
// parser inside is deliberately conservative: any missing/unexpected
// field returns null rather than guessing a cost figure from a response
// shape this session has never actually observed (every live attempt
// was blocked before ever seeing one) — confident-looking parsing code
// for an unverified schema would be its own kind of fabrication.
//
// STATIC_CORRIDOR_COSTS below is the fallback used when the live fetch
// fails (i.e., always, right now): real World Bank RPW Q4-2024 published
// figures for all 9 corridors, supplied directly for this fallback by
// the person who requested it. This service has no way to independently
// re-verify those specific figures against a primary source — the live
// API that would let it cross-check is exactly the one confirmed
// blocked above — so they're taken on the requester's word, not this
// service's own verification, and every response using them says so
// explicitly (data_source: "World Bank RPW Q4-2024", live_data: false,
// static_fallback: true) rather than presenting them as freshly fetched.
//
// Crypto rail costs (XRP/XLM/ALGO network fees + an fx-spread estimate)
// are static constants per this service's own build brief — explicitly
// NOT fetched from anywhere, and explicitly network fees only (on/off-
// ramp costs are real, additional, and vary by local provider — flagged
// in every crypto_rails entry, never bundled into the estimate).
//
// Caching: 24 hours (World Bank's own underlying data is quarterly; a
// daily-or-slower fetch cadence is already more than sufficient, and
// this just reuses fxRateService's own 24h cache for the FX leg).

import { getFxRates } from "./fxRateService.js";

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const WORLD_BANK_RPW_URL = "https://remittanceprices.worldbank.org/api/remittancepricesapi/json";

export const BENCHMARK_SEND_AMOUNT_USD = 200;

export interface CorridorSpec {
  corridor_id: string;
  send_country: string;
  send_currency: string;
  receive_country: string;
  receive_currency: string;
  worldBankIso3: string;
}

// Country code map per this service's own build brief: AUS=AUS, NZL=NZL,
// USA=USA, WST->WSM, FJD->FJI, PGK->PNG, TOP->TON (World Bank's API uses
// ISO3 country codes, not currency codes).
export const CORRIDORS: readonly CorridorSpec[] = [
  { corridor_id: "AUS_WST", send_country: "Australia", send_currency: "AUD", receive_country: "Samoa", receive_currency: "WST", worldBankIso3: "AUS_WSM" },
  { corridor_id: "AUS_FJD", send_country: "Australia", send_currency: "AUD", receive_country: "Fiji", receive_currency: "FJD", worldBankIso3: "AUS_FJI" },
  { corridor_id: "AUS_PGK", send_country: "Australia", send_currency: "AUD", receive_country: "Papua New Guinea", receive_currency: "PGK", worldBankIso3: "AUS_PNG" },
  { corridor_id: "NZL_WST", send_country: "New Zealand", send_currency: "NZD", receive_country: "Samoa", receive_currency: "WST", worldBankIso3: "NZL_WSM" },
  { corridor_id: "NZL_FJD", send_country: "New Zealand", send_currency: "NZD", receive_country: "Fiji", receive_currency: "FJD", worldBankIso3: "NZL_FJI" },
  { corridor_id: "NZL_TOP", send_country: "New Zealand", send_currency: "NZD", receive_country: "Tonga", receive_currency: "TOP", worldBankIso3: "NZL_TON" },
  { corridor_id: "USA_WST", send_country: "United States", send_currency: "USD", receive_country: "Samoa", receive_currency: "WST", worldBankIso3: "USA_WSM" },
  { corridor_id: "USA_FJD", send_country: "United States", send_currency: "USD", receive_country: "Fiji", receive_currency: "FJD", worldBankIso3: "USA_FJI" },
  { corridor_id: "USA_PGK", send_country: "United States", send_currency: "USD", receive_country: "Papua New Guinea", receive_currency: "PGK", worldBankIso3: "USA_PNG" },
];

export type CryptoToken = "XRP" | "XLM" | "ALGO";

interface CryptoTokenSpec {
  token: CryptoToken;
  network_fee_usd: number;
  fx_spread_pct_estimate: number;
}

// Static per this service's own build brief — not fetched. Network fees
// only; on/off-ramp costs are additional and flagged in every response
// entry, never included in these numbers.
export const CRYPTO_TOKENS: readonly CryptoTokenSpec[] = [
  { token: "XRP", network_fee_usd: 0.0001, fx_spread_pct_estimate: 0.02 },
  { token: "XLM", network_fee_usd: 0.00001, fx_spread_pct_estimate: 0.02 },
  { token: "ALGO", network_fee_usd: 0.001, fx_spread_pct_estimate: 0.02 },
];

const ON_OFF_RAMP_NOTE = "Network fees only — on-ramp/off-ramp costs additional and vary by local provider";

interface StaticCorridorCost {
  average_cost_pct: number;
  cheapest_cost_pct: number;
  cheapest_provider: string;
}

// Real World Bank RPW Q4-2024 published figures, supplied directly for
// this fallback (see file doc comment above for provenance — this
// service cannot independently re-verify these against a primary
// source, since the live API that would allow that is exactly the one
// confirmed blocked). provider_count isn't part of this static set —
// that figure is only ever reported when live data is actually
// available, never backfilled with a guess.
const STATIC_CORRIDOR_COSTS: Record<string, StaticCorridorCost> = {
  AUS_WST: { average_cost_pct: 6.8, cheapest_cost_pct: 4.2, cheapest_provider: "Western Union" },
  AUS_FJD: { average_cost_pct: 5.9, cheapest_cost_pct: 3.8, cheapest_provider: "Western Union" },
  AUS_PGK: { average_cost_pct: 8.1, cheapest_cost_pct: 6.2, cheapest_provider: "ANZ" },
  NZL_WST: { average_cost_pct: 7.2, cheapest_cost_pct: 5.1, cheapest_provider: "Western Union" },
  NZL_FJD: { average_cost_pct: 6.4, cheapest_cost_pct: 4.6, cheapest_provider: "Western Union" },
  NZL_TOP: { average_cost_pct: 7.8, cheapest_cost_pct: 5.4, cheapest_provider: "Western Union" },
  USA_WST: { average_cost_pct: 5.9, cheapest_cost_pct: 3.2, cheapest_provider: "Remitly" },
  USA_FJD: { average_cost_pct: 5.4, cheapest_cost_pct: 3.0, cheapest_provider: "Remitly" },
  USA_PGK: { average_cost_pct: 8.6, cheapest_cost_pct: 6.8, cheapest_provider: "Western Union" },
};

export interface TraditionalRails {
  average_cost_pct: number;
  average_cost_usd: number;
  cheapest_provider: string | null;
  cheapest_cost_pct: number;
  provider_count: number | null;
  data_source: "World Bank RPW" | "World Bank RPW Q4-2024";
  data_currency: "quarterly";
  live_data: boolean;
  static_fallback: boolean;
}

export interface CryptoRail {
  token: CryptoToken;
  network_fee_usd: number;
  fx_spread_pct_estimate: number;
  total_estimated_cost_pct: number;
  total_estimated_cost_usd: number;
  on_off_ramp_note: string;
  not_financial_advice: true;
}

export interface LiveFxRate {
  rate: number | null;
  pair: string;
  source: string;
  as_of: "daily";
}

export interface CorridorResult {
  corridor_id: string;
  send_country: string;
  send_currency: string;
  receive_country: string;
  receive_currency: string;
  benchmark_send_amount_usd: number;
  live_fx_rate: LiveFxRate;
  traditional_rails: TraditionalRails | null;
  traditional_rails_note: string | null;
  crypto_rails: CryptoRail[];
  potential_saving_pct: number | null;
  not_financial_advice: true;
}

export interface RemittanceSnapshot {
  corridors: CorridorResult[];
  fetch_warnings: string[];
  generated_at: string;
}

interface LiveCorridorCost {
  average_cost_pct: number;
  cheapest_cost_pct: number;
  cheapest_provider: string | null;
  provider_count: number;
}

/**
 * Attempts a live World Bank RPW fetch. Returns null on any failure —
 * confirmed live this session (and from this app's actual deployment)
 * to always be the outcome (see file doc comment) — or if the response
 * doesn't match the few plausible fields this parser looks for. Never
 * guesses a cost figure from an unrecognised shape.
 */
async function fetchWorldBankCorridor(iso3Pair: string): Promise<LiveCorridorCost | null> {
  try {
    const response = await fetch(`${WORLD_BANK_RPW_URL}?iso3=${iso3Pair}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      corridors?: Array<{
        cc1_average?: number;
        cheapest_provider_name?: string | null;
        cheapest_cost_pct?: number;
        no_institutions?: number;
      }>;
    };
    const corridor = data.corridors?.[0];
    if (!corridor || typeof corridor.cc1_average !== "number" || typeof corridor.no_institutions !== "number") {
      return null; // response didn't match the expected shape — degrade, don't guess
    }

    return {
      average_cost_pct: corridor.cc1_average,
      cheapest_provider: corridor.cheapest_provider_name ?? null,
      cheapest_cost_pct: corridor.cheapest_cost_pct ?? corridor.cc1_average,
      provider_count: corridor.no_institutions,
    };
  } catch {
    return null;
  }
}

/**
 * Live World Bank data takes priority when available; otherwise falls
 * back to STATIC_CORRIDOR_COSTS (see that constant's doc comment for
 * provenance). Returns null only if a corridor has neither — true for
 * none of the current 9, but kept rather than assumed, in case
 * CORRIDORS ever grows beyond what the static table covers.
 * average_cost_usd is always derived from average_cost_pct at this
 * service's own BENCHMARK_SEND_AMOUNT_USD, for both paths — not trusted
 * from a live response's own USD figure, since that field was never
 * actually observed either (see fetchWorldBankCorridor).
 */
function deriveTraditionalRails(corridorId: string, live: LiveCorridorCost | null): TraditionalRails | null {
  if (live) {
    return {
      average_cost_pct: live.average_cost_pct,
      average_cost_usd: Math.round((live.average_cost_pct / 100) * BENCHMARK_SEND_AMOUNT_USD * 100) / 100,
      cheapest_provider: live.cheapest_provider,
      cheapest_cost_pct: live.cheapest_cost_pct,
      provider_count: live.provider_count,
      data_source: "World Bank RPW",
      data_currency: "quarterly",
      live_data: true,
      static_fallback: false,
    };
  }

  const fallback = STATIC_CORRIDOR_COSTS[corridorId];
  if (!fallback) return null;

  return {
    average_cost_pct: fallback.average_cost_pct,
    average_cost_usd: Math.round((fallback.average_cost_pct / 100) * BENCHMARK_SEND_AMOUNT_USD * 100) / 100,
    cheapest_provider: fallback.cheapest_provider,
    cheapest_cost_pct: fallback.cheapest_cost_pct,
    provider_count: null,
    data_source: "World Bank RPW Q4-2024",
    data_currency: "quarterly",
    live_data: false,
    static_fallback: true,
  };
}

function buildCryptoRails(): CryptoRail[] {
  return CRYPTO_TOKENS.map((spec) => {
    // total_estimated_cost_usd = the fx-spread percentage applied to the
    // benchmark amount, PLUS the (negligible) flat network fee — both
    // components of a real total cost, even though the network fee
    // rounds away to nothing at 2 decimal places for every token here.
    const spreadCostUsd = (spec.fx_spread_pct_estimate / 100) * BENCHMARK_SEND_AMOUNT_USD;
    const totalCostUsd = spreadCostUsd + spec.network_fee_usd;
    const totalCostPct = (totalCostUsd / BENCHMARK_SEND_AMOUNT_USD) * 100;
    return {
      token: spec.token,
      network_fee_usd: spec.network_fee_usd,
      fx_spread_pct_estimate: spec.fx_spread_pct_estimate,
      total_estimated_cost_pct: Math.round(totalCostPct * 10_000) / 10_000,
      total_estimated_cost_usd: Math.round(totalCostUsd * 10_000) / 10_000,
      on_off_ramp_note: ON_OFF_RAMP_NOTE,
      not_financial_advice: true,
    };
  });
}

let cache: { data: RemittanceSnapshot; expires: number } | null = null;

/**
 * Builds the full 9-corridor snapshot. Calls fxRateService's own
 * getFxRates directly, in-process — the "consumes the upgraded FX
 * service internally" dependency this endpoint's build brief asks for.
 * Tests mock the underlying upstream `fetch` calls (both this service's
 * World Bank call and fxRateService's own currency-api/open-er-api/
 * Frankfurter calls), the same convention every other service test in
 * this codebase uses, rather than injecting a stub function.
 */
export async function getRemittanceSnapshot(): Promise<RemittanceSnapshot> {
  if (cache && Date.now() < cache.expires) return cache.data;

  const fetchWarnings: string[] = [];
  const cryptoRails = buildCryptoRails();
  const bestCryptoCostPct = Math.min(...cryptoRails.map((r) => r.total_estimated_cost_pct));

  const corridors = await Promise.all(
    CORRIDORS.map(async (spec): Promise<CorridorResult> => {
      const [fxResult, liveCost] = await Promise.all([getFxRates(spec.send_currency, spec.receive_currency, 1), fetchWorldBankCorridor(spec.worldBankIso3)]);

      const rate = fxResult.converted?.result ?? null;
      if (rate === null) {
        fetchWarnings.push(`${spec.corridor_id}: live FX rate unavailable this cycle`);
      }

      if (!liveCost) {
        fetchWarnings.push(`${spec.corridor_id}: World Bank RPW live fetch unavailable this cycle — using Q4-2024 static fallback`);
      }

      const traditionalRails = deriveTraditionalRails(spec.corridor_id, liveCost);
      if (!traditionalRails) {
        fetchWarnings.push(`${spec.corridor_id}: no World Bank data available (live or static) for this corridor`);
      }

      const potentialSavingPct = traditionalRails ? Math.round((traditionalRails.average_cost_pct - bestCryptoCostPct) * 10_000) / 10_000 : null;

      return {
        corridor_id: spec.corridor_id,
        send_country: spec.send_country,
        send_currency: spec.send_currency,
        receive_country: spec.receive_country,
        receive_currency: spec.receive_currency,
        benchmark_send_amount_usd: BENCHMARK_SEND_AMOUNT_USD,
        live_fx_rate: {
          rate,
          pair: `${spec.send_currency}_to_${spec.receive_currency}`,
          source: fxResult.source,
          as_of: "daily",
        },
        traditional_rails: traditionalRails,
        traditional_rails_note: traditionalRails
          ? null
          : "World Bank Remittance Prices Worldwide has no data available for this corridor — its live API is unreachable from this server, and no Q4-2024 static fallback figure exists for this corridor either (see pacificRemittanceService.ts for detail). Traditional-rail cost comparison is unavailable; crypto_rails and live_fx_rate are unaffected.",
        crypto_rails: cryptoRails,
        potential_saving_pct: potentialSavingPct,
        not_financial_advice: true,
      };
    }),
  );

  const snapshot: RemittanceSnapshot = {
    corridors,
    fetch_warnings: fetchWarnings,
    generated_at: new Date().toISOString(),
  };

  cache = { data: snapshot, expires: Date.now() + CACHE_TTL_MS };
  return snapshot;
}

/** Test-only: clears the in-memory cache between test cases. */
export function __resetRemittanceCacheForTests(): void {
  cache = null;
}
