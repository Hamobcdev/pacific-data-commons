// fxRateService.ts
//
// Fetches Pacific-relevant FX rates from free public sources. No API key
// required for any source.
//
// Primary: fawazahmed0/currency-api (community-maintained, daily-updated,
// dual-CDN — jsDelivr then a Cloudflare Pages mirror). This is the actual
// primary because it is the only free, keyless source that has live rate
// data for the Pacific currencies this endpoint exists to serve — see the
// paragraph below.
//
// Secondary: Frankfurter (ECB reference rates). Verified during Session 30
// intelligence phase: Frankfurter's /v2/currencies metadata *lists* WST,
// FJD, TOP, PGK, SBD, VUV as recognised ISO codes, but its actual rates
// endpoint returns no data for any of them — ECB does not publish reference
// rates for Pacific currencies. Frankfurter is only useful here as a
// secondary source for the six ECB-tracked majors (AUD, NZD, EUR, GBP, JPY,
// CNY) if the primary is unavailable. Open Exchange Rates (the brief's
// original fallback) was also checked and rejected: its "keyless" free
// latest.json returns 403 missing_app_id — it requires real signup, not
// actually keyless.
//
// ALGO price: CoinGecko free API (no key, generous rate limit)
//   https://api.coingecko.com/api/v3/simple/price?ids=algorand&vs_currencies=usd
//
// All requests: 5 second timeout, AbortSignal.
// Caching: 60 minutes in-memory (rates update once daily upstream).
// Never throws: any currency missing from every live source falls back to
// a static approximation, individually — a partial outage degrades one
// currency's freshness, not the whole response.

const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

const CURRENCY_API_JSDELIVR_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
const CURRENCY_API_PAGES_FALLBACK_URL = "https://latest.currency-api.pages.dev/v1/currencies/usd.json";
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest";
const COINGECKO_ALGO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=algorand&vs_currencies=usd";

// Frankfurter (ECB) only ever has data for these — see doc comment above.
const FRANKFURTER_SUPPORTED = ["AUD", "NZD", "EUR", "GBP", "JPY", "CNY"] as const;

export type FiatCurrencyCode = "WST" | "FJD" | "TOP" | "PGK" | "SBD" | "VUV" | "AUD" | "NZD" | "EUR" | "GBP" | "JPY" | "CNY";

const FIAT_CURRENCIES: FiatCurrencyCode[] = ["WST", "FJD", "TOP", "PGK", "SBD", "VUV", "AUD", "NZD", "EUR", "GBP", "JPY", "CNY"];

// Recent approximations, used only when every live source is unavailable
// for a given currency. Source field always names when this was used.
const STATIC_FALLBACK_RATES: Record<FiatCurrencyCode, number> = {
  WST: 2.72,
  FJD: 2.19,
  TOP: 2.41,
  PGK: 4.44,
  SBD: 8.01,
  VUV: 118.36,
  AUD: 1.4,
  NZD: 1.67,
  EUR: 0.86,
  GBP: 0.73,
  JPY: 159.1,
  CNY: 6.72,
};

export type FxSource = "currency-api" | "currency-api-fallback" | "frankfurter-partial+static" | "static-only";

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
      rates = await fetchFromFrankfurter();
      source = "frankfurter-partial+static";
    } catch {
      rates = {};
      source = "static-only";
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

  return {
    base: "USD",
    timestamp: new Date().toISOString(),
    source,
    rates: { ...fullRates, ALGO: algoPrice, USDC: 1.0 },
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
