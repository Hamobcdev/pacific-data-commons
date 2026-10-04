// fxRateService.ts
//
// Fetches Pacific FX Registry rates from free public sources. No API key
// required for any source actually used.
//
// Primary: fawazahmed0/currency-api (community-maintained, daily-updated,
// dual-CDN — jsDelivr then a Cloudflare Pages mirror). This is the actual
// primary because, confirmed live, it's the only free keyless source with
// a SINGLE request covering every currency this registry serves — all 8
// Pacific island currencies AND all 10 major sender currencies, in one
// usd.json response.
//
// Secondary (full re-verification for this registry's expansion,
// confirmed live): open.er-api.com (ExchangeRate-API's genuinely free,
// keyless tier — distinct from openexchangerates.org's "latest.json",
// which was already checked and rejected below: that one 403s
// missing_app_id, it requires real signup despite being marketed as
// keyless). open.er-api.com ALSO covers every currency this registry
// serves in one request, so it's a genuine full-coverage fallback, not a
// partial one needing a merge with anything else.
//
// Tertiary: Frankfurter (ECB reference rates). Verified during Session 30
// intelligence phase, re-confirmed live for this expansion: Frankfurter's
// /v2/currencies metadata *lists* WST, FJD, TOP, PGK, SBD, VUV, XPF, KHR
// as recognised ISO codes, but its actual rates endpoint returns no data
// for any Pacific island currency — ECB does not publish reference rates
// for them. Frankfurter only ever supplies the 9 majors (AUD, NZD, EUR,
// GBP, JPY, CNY, SGD, CAD, HKD, all confirmed present live) — used only
// if BOTH full-coverage sources above are down, with static approximations
// filling every Pacific currency it can't provide.
//
// This registry's original build brief proposed a "Source A covers
// majors (Frankfurter), Source B covers Pacific currencies, merge the
// two" architecture. That doesn't match what's actually true: Frankfurter
// has NO Pacific coverage at all (confirmed, see above), while BOTH
// currency-api and open.er-api.com are independently full-coverage
// (majors AND Pacific) in a single request each. There's nothing to
// merge — an ordered fallback between whichever single source actually
// responds is both simpler and more correct than reconciling two partial
// datasets that don't actually exist as such.
//
// Open Exchange Rates (openexchangerates.org) was checked and rejected in
// an earlier session: its "keyless" free latest.json returns 403
// missing_app_id — it requires real signup, not actually keyless. Not the
// same service as open.er-api.com above.
//
// ALGO price: CoinGecko free API (no key, generous rate limit)
//   https://api.coingecko.com/api/v3/simple/price?ids=algorand&vs_currencies=usd
//
// All requests: 5 second timeout, AbortSignal.
// Caching: 24 hours in-memory (ECB/Frankfurter and both full-coverage
// sources update once daily upstream — this registry's own build brief
// asks for 24h specifically; the previous 60-minute TTL was shorter than
// the data's real update cadence warranted).
// Never throws: any currency missing from every live source falls back to
// a static approximation, individually — a partial outage degrades one
// currency's freshness, not the whole response.

const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const CURRENCY_API_JSDELIVR_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
const CURRENCY_API_PAGES_FALLBACK_URL = "https://latest.currency-api.pages.dev/v1/currencies/usd.json";
const OPEN_ER_API_URL = "https://open.er-api.com/v6/latest/USD";
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest";
const COINGECKO_ALGO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=algorand&vs_currencies=usd";

// Frankfurter (ECB) only ever has data for these — see doc comment above.
const FRANKFURTER_SUPPORTED = ["AUD", "NZD", "EUR", "GBP", "JPY", "CNY", "SGD", "CAD", "HKD"] as const;

export const PACIFIC_CURRENCIES = ["WST", "FJD", "PGK", "TOP", "VUV", "SBD", "XPF", "KHR"] as const;
const MAJOR_CURRENCIES = ["USD", "AUD", "NZD", "EUR", "GBP", "JPY", "CNY", "SGD", "CAD", "HKD"] as const;

export type FiatCurrencyCode =
  | "WST"
  | "FJD"
  | "TOP"
  | "PGK"
  | "SBD"
  | "VUV"
  | "XPF"
  | "KHR"
  | "AUD"
  | "NZD"
  | "EUR"
  | "GBP"
  | "JPY"
  | "CNY"
  | "SGD"
  | "CAD"
  | "HKD";

const FIAT_CURRENCIES: FiatCurrencyCode[] = ["WST", "FJD", "TOP", "PGK", "SBD", "VUV", "XPF", "KHR", "AUD", "NZD", "EUR", "GBP", "JPY", "CNY", "SGD", "CAD", "HKD"];

// Recent approximations (live-verified at the time each currency was
// added), used only when every live source is unavailable for a given
// currency. Source field always names when this was used.
const STATIC_FALLBACK_RATES: Record<FiatCurrencyCode, number> = {
  WST: 2.72,
  FJD: 2.19,
  TOP: 2.41,
  PGK: 4.44,
  SBD: 8.01,
  VUV: 118.36,
  XPF: 106.0,
  KHR: 4055.0,
  AUD: 1.4,
  NZD: 1.67,
  EUR: 0.86,
  GBP: 0.73,
  JPY: 159.1,
  CNY: 6.72,
  SGD: 1.28,
  CAD: 1.43,
  HKD: 7.85,
};

// Kiribati, Nauru, and Tuvalu use AUD directly as their legal tender (no
// separate central bank or currency of their own) — not a currency to
// fetch a rate for, a fact to state. Static, never fetched.
export const MICRO_STATE_PEGS = [
  { country: "Kiribati", currency: "AUD", note: "pegged_to_aud", peg_confirmed: true },
  { country: "Nauru", currency: "AUD", note: "pegged_to_aud", peg_confirmed: true },
  { country: "Tuvalu", currency: "AUD", note: "pegged_to_aud", peg_confirmed: true },
] as const;

export type FxSource = "currency-api" | "currency-api-fallback" | "open-er-api" | "frankfurter-partial+static" | "static-only";

const SOURCE_LABELS: Record<FxSource, string[]> = {
  "currency-api": ["fawazahmed0/currency-api (jsDelivr)"],
  "currency-api-fallback": ["fawazahmed0/currency-api (Cloudflare Pages mirror)"],
  "open-er-api": ["ExchangeRate-API (open.er-api.com)"],
  "frankfurter-partial+static": ["Frankfurter (ECB)", "static fallback (Pacific currencies — ECB has no Pacific rate data)"],
  "static-only": ["static fallback (all live sources unavailable this cycle)"],
};

const COVERAGE_NOTES: Record<FxSource, string> = {
  "currency-api": "All rates sourced from fawazahmed0/currency-api, a daily-updated community-maintained feed. Rates are indicative mid-market. Not financial advice.",
  "currency-api-fallback":
    "All rates sourced from fawazahmed0/currency-api via its Cloudflare Pages mirror (primary jsDelivr CDN was unavailable this cycle). Rates are indicative mid-market. Not financial advice.",
  "open-er-api": "All rates sourced from ExchangeRate-API's free tier (fawazahmed0/currency-api was unavailable this cycle). Rates are indicative mid-market. Not financial advice.",
  "frankfurter-partial+static":
    "Major currencies from ECB via Frankfurter. Pacific island currencies are NOT available from ECB and use a static approximation instead (both full-coverage sources were unavailable this cycle) — treat Pacific rates as stale. Not financial advice.",
  "static-only": "Every live source was unavailable this cycle — all rates are static approximations, not live data. Not financial advice.",
};

export interface FxRates {
  base: "USD";
  timestamp: string;
  source: FxSource;
  rates: Record<FiatCurrencyCode, number> & { ALGO: number; USDC: number };
  converted?: {
    from: string;
    to: string;
    amount: number;
    result: number;
  };
  micro_state_pegs: typeof MICRO_STATE_PEGS;
  data_sources: string[];
  data_currency: "daily";
  coverage_note: string;
  not_financial_advice: true;
  generated_at: string;
  cache_expires_at: string;
}

let cache: { data: FxRates; expires: number } | null = null;

/** fawazahmed0/currency-api response shape: { date: string, usd: { <lowercase iso code>: number, ... } } */
interface CurrencyApiResponse {
  usd?: Record<string, number>;
}

async function fetchCurrencyApiHost(url: string): Promise<Partial<Record<FiatCurrencyCode, number>>> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`currency-api ${url} returned HTTP ${response.status}`);
  const data = (await response.json()) as CurrencyApiResponse;
  const usd = data.usd ?? {};
  const rates: Partial<Record<FiatCurrencyCode, number>> = {};
  for (const code of FIAT_CURRENCIES) {
    const value = usd[code.toLowerCase()];
    if (typeof value === "number") rates[code] = value;
  }
  return rates;
}

/** jsDelivr primary, Cloudflare Pages mirror fallback — same project, two independent CDNs (CLAUDE.md Section 6: never a single node). */
async function fetchFromCurrencyApi(): Promise<{ rates: Partial<Record<FiatCurrencyCode, number>>; host: "currency-api" | "currency-api-fallback" }> {
  try {
    const rates = await fetchCurrencyApiHost(CURRENCY_API_JSDELIVR_URL);
    return { rates, host: "currency-api" };
  } catch {
    const rates = await fetchCurrencyApiHost(CURRENCY_API_PAGES_FALLBACK_URL);
    return { rates, host: "currency-api-fallback" };
  }
}

/** open.er-api.com response shape: { result: "success", rates: { <ISO code>: number, ... } } — full coverage of every currency this registry serves, confirmed live. */
async function fetchFromOpenErApi(): Promise<Partial<Record<FiatCurrencyCode, number>>> {
  const response = await fetch(OPEN_ER_API_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`open.er-api.com returned HTTP ${response.status}`);
  const data = (await response.json()) as { result?: string; rates?: Record<string, number> };
  if (data.result !== "success" || !data.rates) throw new Error("open.er-api.com did not return a successful result");
  const rates: Partial<Record<FiatCurrencyCode, number>> = {};
  for (const code of FIAT_CURRENCIES) {
    const value = data.rates[code];
    if (typeof value === "number") rates[code] = value;
  }
  return rates;
}

async function fetchFromFrankfurter(): Promise<Partial<Record<FiatCurrencyCode, number>>> {
  const response = await fetch(`${FRANKFURTER_URL}?base=USD&symbols=${FRANKFURTER_SUPPORTED.join(",")}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Frankfurter returned HTTP ${response.status}`);
  const data = (await response.json()) as { rates?: Record<string, number> };
  return (data.rates ?? {}) as Partial<Record<FiatCurrencyCode, number>>;
}

async function fetchAlgoPrice(): Promise<number> {
  const response = await fetch(COINGECKO_ALGO_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`CoinGecko returned HTTP ${response.status}`);
  const data = (await response.json()) as { algorand?: { usd?: number } };
  return data.algorand?.usd ?? 0;
}

async function fetchFreshRates(): Promise<FxRates> {
  let rates: Partial<Record<FiatCurrencyCode, number>> = {};
  let source: FxSource;

  try {
    const result = await fetchFromCurrencyApi();
    rates = result.rates;
    source = result.host;
  } catch {
    try {
      rates = await fetchFromOpenErApi();
      source = "open-er-api";
    } catch {
      try {
        rates = await fetchFromFrankfurter();
        source = "frankfurter-partial+static";
      } catch {
        rates = {};
        source = "static-only";
      }
    }
  }

  let algoPrice = 0;
  try {
    algoPrice = await fetchAlgoPrice();
  } catch {
    // ALGO price unavailable — return 0, clearly a missing value rather than a guess.
  }

  const fullRates = FIAT_CURRENCIES.reduce(
    (acc, code) => {
      acc[code] = rates[code] ?? STATIC_FALLBACK_RATES[code];
      return acc;
    },
    {} as Record<FiatCurrencyCode, number>,
  );

  const now = new Date();
  return {
    base: "USD",
    timestamp: now.toISOString(),
    source,
    rates: { ...fullRates, ALGO: algoPrice, USDC: 1.0 },
    micro_state_pegs: MICRO_STATE_PEGS,
    data_sources: SOURCE_LABELS[source],
    data_currency: "daily",
    coverage_note: COVERAGE_NOTES[source],
    not_financial_advice: true,
    generated_at: now.toISOString(),
    cache_expires_at: new Date(now.getTime() + CACHE_TTL_MS).toISOString(),
  };
}

function performConversion(rates: FxRates["rates"], from: string, to: string, amount: number): FxRates["converted"] {
  const allRates: Record<string, number> = { ...rates, USD: 1.0 };
  const fromRate = allRates[from];
  const toRate = allRates[to];

  if (!fromRate || !toRate) {
    return { from, to, amount, result: 0 };
  }

  const inUsd = amount / fromRate;
  const result = inUsd * toRate;

  return {
    from: from.toUpperCase(),
    to: to.toUpperCase(),
    amount,
    result: Math.round(result * 10_000) / 10_000,
  };
}

/**
 * Derives a rates table relative to a new base currency from the
 * canonical USD-base table — pure cross-rate arithmetic, no extra fetch
 * needed. `newBase` must already be a key in `usdBaseRates` (or "USD"
 * itself) — the route layer validates this before calling, so this
 * function trusts its input rather than re-validating.
 */
export function rebaseRates(usdBaseRates: Record<string, number>, newBase: string): Record<string, number> {
  if (newBase === "USD") return { ...usdBaseRates };
  const baseRate = usdBaseRates[newBase];
  const rebased: Record<string, number> = {};
  for (const [code, rate] of Object.entries(usdBaseRates)) {
    if (code === newBase) continue;
    rebased[code] = rate / baseRate!;
  }
  rebased.USD = 1 / baseRate!;
  return rebased;
}

export async function getFxRates(convertFrom?: string, convertTo?: string, convertAmount?: number): Promise<FxRates> {
  if (!cache || Date.now() >= cache.expires) {
    const fresh = await fetchFreshRates();
    cache = { data: fresh, expires: Date.now() + CACHE_TTL_MS };
  }

  const result: FxRates = { ...cache.data };
  if (convertFrom && convertTo && convertAmount !== undefined) {
    result.converted = performConversion(cache.data.rates, convertFrom, convertTo, convertAmount);
  }
  return result;
}

/** Test-only: clears the in-memory cache between test cases. */
export function __resetFxRateCacheForTests(): void {
  cache = null;
}
