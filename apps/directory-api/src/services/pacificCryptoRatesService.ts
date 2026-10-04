import { logger } from "../lib/logger.js";

// pacificCryptoRatesService.ts
//
// Real-time prices for a curated list of crypto tokens, Pacific-priority
// weighted (ALGO, XRP, XLM), sourced from CoinGecko's free public API —
// no API key required for /coins/markets at this volume.
//
// CURATED_TOKEN_IDS below is 67, not the 75 named in this endpoint's
// build brief. The brief's own enumerated ID list, deduplicated (it
// listed "aptos" twice), is 71 unique IDs, not 75 — a count mismatch in
// the brief itself, confirmed by counting it directly. Of those 71,
// confirmed live against CoinGecko before writing any code:
//
//   - `polygon`, `compound`, `synthetix` return an empty array — not
//     valid CoinGecko ids. (Polygon's real id, `matic-network`, was
//     already separately in the brief's list, so this isn't a gap.)
//   - `base` — the one id the brief itself flagged as uncertain — DOES
//     resolve, but to an unrelated token: symbol "base", name "Base",
//     price ~$0.0000008, $0 market cap, no rank, first listed 2023.
//     Coinbase's Base L2 network has no native token at all (it uses ETH
//     for gas), so this is not "Coinbase's L2 token" under any reading —
//     it's a coincidentally-named, essentially worthless microcap.
//     Including it labelled "BASE" would misattribute an unrelated
//     project's price as Coinbase L2's, which is a worse data-integrity
//     problem than the "drop if not found" case the brief anticipated.
//     Dropped for the same reason, not just the same mechanism.
//
// 71 requested - polygon - compound - synthetix - base = 67 confirmed,
// genuinely-matching tokens. CURATED_TOKEN_IDS is exactly that verified
// list, nothing else.
//
// Category tagging (?category=defi|l1|l2|pacific) is a hand-curated
// best-effort classification (CATEGORY_TOKEN_IDS below), not a live
// lookup against CoinGecko's own tags/categories API — the brief itself
// calls this "best-effort grouping," and a per-token category-lookup
// call for 67 tokens would multiply this endpoint's CoinGecko request
// volume far past what the 60s cache is designed to absorb for no
// corresponding accuracy benefit at this scope.
//
// Caching: ONE 60-second cache slot holds the full, unfiltered fetch of
// all 67 curated tokens — ?symbols=/?category= filtering happens
// in-memory against that single cached dataset, not as separate
// per-query-param upstream fetches. This matters operationally, not just
// for performance: CoinGecko's free tier allows roughly 30 requests per
// minute (confirmed live — a single individual-id verification request
// during this session's own build-time testing hit a 429), and every
// paid query to this endpoint sharing one upstream fetch per 60s keeps
// this endpoint's real CoinGecko usage at roughly 1 request/minute
// regardless of buyer query volume.
//
// Never fabricates a price: if CoinGecko's response is missing a
// curated token, or returns it with a null current_price, that token is
// omitted from the response's tokens array and listed in
// fetch_warnings instead — never included with a placeholder/zero price.
//
// Static fallback (added once CoinGecko was confirmed blocked from
// Cloudflare Workers outbound network, same pattern as
// pacificRemittanceService.ts's World Bank RPW fallback): when the live
// fetch fails entirely, this service serves STATIC_CRYPTO_PRICES instead
// of returning null — the route layer must never 502 a buyer who already
// paid for the query (Decision 59/60's first-party endpoints promise
// $0.01-tier data, not an error). Deliberately a small, named subset (7
// of the 67 curated tokens), not all 67 with a guessed price: these 7
// prices were supplied directly by the person who requested this
// fallback, and the other 60 simply have no static figure to fall back
// to, so they're omitted (fetch_warnings explains why) — same
// "never fabricate a price" posture as the live path above.

const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export const COINGECKO_MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets";

// Pacific-priority (always included, regardless of market cap rank).
const PACIFIC_PRIORITY_IDS = ["algorand", "ripple", "stellar"] as const;
export const PACIFIC_PRIORITY_SYMBOLS = ["ALGO", "XRP", "XLM"] as const;

// Confirmed-live, deduplicated, with polygon/compound/synthetix/base
// dropped (see file doc comment above) — 64 "top market cap" ids + the
// 3 Pacific-priority ids above = 67 total.
export const CURATED_TOKEN_IDS: readonly string[] = [
  ...PACIFIC_PRIORITY_IDS,
  "bitcoin",
  "ethereum",
  "tether",
  "binancecoin",
  "usd-coin",
  "solana",
  "cardano",
  "avalanche-2",
  "polkadot",
  "chainlink",
  "near",
  "aptos",
  "arbitrum",
  "optimism",
  "uniswap",
  "aave",
  "maker",
  "curve-dao-token",
  "yearn-finance",
  "sushi",
  "pancakeswap-token",
  "1inch",
  "the-graph",
  "filecoin",
  "internet-computer",
  "helium",
  "render-token",
  "fetch-ai",
  "ocean-protocol",
  "singularitynet",
  "immutable-x",
  "axie-infinity",
  "decentraland",
  "the-sandbox",
  "enjincoin",
  "flow",
  "wax",
  "ronin",
  "gala",
  "stepn",
  "matic-network",
  "fantom",
  "harmony",
  "celo",
  "terra-luna-2",
  "injective-protocol",
  "sei-network",
  "sui",
  "cosmos",
  "osmosis",
  "juno-network",
  "stargaze",
  "akash-network",
  "evmos",
  "kava",
  "band-protocol",
  "thorchain",
  "chainflip",
  "litecoin",
  "dogecoin",
  "shiba-inu",
  "tron",
  "monero",
  "zcash",
];

export const SOURCE_ATTRIBUTION = "CoinGecko Public API — https://www.coingecko.com/en/api";
export const COINGECKO_UPDATE_FREQUENCY_NOTE = "Every ~60 seconds on CoinGecko free tier";

export type Category = "defi" | "l1" | "l2" | "pacific";
export const VALID_CATEGORIES: readonly Category[] = ["defi", "l1", "l2", "pacific"];

// Hand-curated best-effort grouping (see file doc comment above).
const CATEGORY_TOKEN_IDS: Record<Exclude<Category, "pacific">, readonly string[]> = {
  l1: [
    "bitcoin",
    "ethereum",
    "binancecoin",
    "solana",
    "cardano",
    "avalanche-2",
    "polkadot",
    "near",
    "aptos",
    "cosmos",
    "sui",
    "sei-network",
    "celo",
    "harmony",
    "fantom",
    "tron",
    "litecoin",
    "dogecoin",
    "monero",
    "zcash",
    "algorand",
    "ripple",
    "stellar",
    "osmosis",
    "juno-network",
    "stargaze",
    "evmos",
    "kava",
    "injective-protocol",
    "akash-network",
  ],
  l2: ["arbitrum", "optimism", "matic-network", "immutable-x", "ronin"],
  defi: ["uniswap", "aave", "curve-dao-token", "yearn-finance", "sushi", "pancakeswap-token", "1inch", "thorchain", "band-protocol", "chainflip", "maker"],
};

export interface CryptoToken {
  symbol: string;
  name: string;
  coingecko_id: string;
  price_usd: number;
  change_24h_pct: number;
  market_cap_usd: number;
  volume_24h_usd: number;
  market_cap_rank: number | null;
}

export interface CryptoRatesSnapshot {
  tokens: CryptoToken[];
  fetch_warnings: string[];
  cached_at: string;
  static_fallback: boolean;
  static_fallback_reason: string | null;
  prices_as_of: string | null;
}

/** Just enough of CoinGecko's /coins/markets response shape to read — untrusted third-party HTTP JSON, same posture as this codebase's other upstream response interfaces. */
interface CoinGeckoMarketEntry {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  price_change_percentage_24h: number | null;
  market_cap: number | null;
  total_volume: number | null;
  market_cap_rank: number | null;
}

function buildMarketsUrl(): string {
  const params = new URLSearchParams({
    vs_currency: "usd",
    ids: CURATED_TOKEN_IDS.join(","),
    order: "market_cap_desc",
    per_page: "250",
    page: "1",
    sparkline: "false",
  });
  return `${COINGECKO_MARKETS_URL}?${params.toString()}`;
}

async function fetchFreshSnapshot(): Promise<CryptoRatesSnapshot | null> {
  try {
    const response = await fetch(buildMarketsUrl(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;

    const entries = (await response.json()) as CoinGeckoMarketEntry[];
    const byId = new Map(entries.map((e) => [e.id, e]));

    const tokens: CryptoToken[] = [];
    const fetchWarnings: string[] = [];

    for (const id of CURATED_TOKEN_IDS) {
      const entry = byId.get(id);
      if (!entry || entry.current_price === null || entry.current_price === undefined) {
        fetchWarnings.push(`${id}: no price data returned by CoinGecko this cycle`);
        continue;
      }
      tokens.push({
        symbol: entry.symbol.toUpperCase(),
        name: entry.name,
        coingecko_id: entry.id,
        price_usd: entry.current_price,
        change_24h_pct: entry.price_change_percentage_24h ?? 0,
        market_cap_usd: entry.market_cap ?? 0,
        volume_24h_usd: entry.total_volume ?? 0,
        market_cap_rank: entry.market_cap_rank,
      });
    }

    return { tokens, fetch_warnings: fetchWarnings, cached_at: new Date().toISOString(), static_fallback: false, static_fallback_reason: null, prices_as_of: null };
  } catch {
    return null;
  }
}

interface StaticTokenSpec {
  symbol: string;
  name: string;
  coingecko_id: string;
  price_usd: number;
}

// Supplied directly for this fallback (see file doc comment above for
// provenance) — not fetched, not derived from a live CoinGecko response.
const STATIC_CRYPTO_PRICES: readonly StaticTokenSpec[] = [
  { symbol: "ALGO", name: "Algorand", coingecko_id: "algorand", price_usd: 0.1323 },
  { symbol: "XRP", name: "XRP", coingecko_id: "ripple", price_usd: 1.52 },
  { symbol: "XLM", name: "Stellar", coingecko_id: "stellar", price_usd: 0.11 },
  { symbol: "BTC", name: "Bitcoin", coingecko_id: "bitcoin", price_usd: 86438 },
  { symbol: "ETH", name: "Ethereum", coingecko_id: "ethereum", price_usd: 2728 },
  { symbol: "USDC", name: "USD Coin", coingecko_id: "usd-coin", price_usd: 1.0 },
  { symbol: "USDT", name: "Tether", coingecko_id: "tether", price_usd: 1.0 },
];

const STATIC_PRICES_AS_OF = "2026-10-05";

/**
 * Built only when the live fetch fails entirely. change_24h_pct/
 * market_cap_usd/volume_24h_usd are 0/null rather than a guessed figure
 * — same "never fabricate" posture fetchFreshSnapshot's own per-token
 * omission applies, just at the whole-snapshot level instead.
 */
function buildStaticFallbackSnapshot(reason: string): CryptoRatesSnapshot {
  const tokens: CryptoToken[] = STATIC_CRYPTO_PRICES.map((spec) => ({
    symbol: spec.symbol,
    name: spec.name,
    coingecko_id: spec.coingecko_id,
    price_usd: spec.price_usd,
    change_24h_pct: 0,
    market_cap_usd: 0,
    volume_24h_usd: 0,
    market_cap_rank: null,
  }));
  const omittedCount = CURATED_TOKEN_IDS.length - tokens.length;
  return {
    tokens,
    fetch_warnings: [
      `CoinGecko live fetch unavailable this cycle — serving ${tokens.length} static fallback prices (as of ${STATIC_PRICES_AS_OF}); the other ${omittedCount} curated tokens have no static fallback figure and are omitted`,
    ],
    cached_at: new Date().toISOString(),
    static_fallback: true,
    static_fallback_reason: reason,
    prices_as_of: STATIC_PRICES_AS_OF,
  };
}

let cache: { data: CryptoRatesSnapshot; expires: number } | null = null;

/**
 * The full curated-token snapshot (unfiltered) — 60-second cached.
 * ?symbols=/?category= filtering is applied by the route layer against
 * this cached result, not as separate upstream fetches. Never returns
 * null and never throws: a failed live fetch (confirmed blocked from
 * Cloudflare Workers outbound network at the time this fallback was
 * added) serves buildStaticFallbackSnapshot() instead — the route layer
 * must always be able to return 200 to a buyer who already paid for this
 * query.
 */
export async function getCryptoRatesSnapshot(): Promise<CryptoRatesSnapshot> {
  if (cache && Date.now() < cache.expires) return cache.data;

  const fresh = await fetchFreshSnapshot();
  const snapshot = fresh ?? buildStaticFallbackSnapshot("upstream_blocked");
  if (snapshot.static_fallback) {
    logger.info("crypto_rates_static_fallback", { reason: snapshot.static_fallback_reason, token_count: snapshot.tokens.length });
  }

  cache = { data: snapshot, expires: Date.now() + CACHE_TTL_MS };
  return snapshot;
}

export function tokensForCategory(tokens: CryptoToken[], category: Category): CryptoToken[] {
  if (category === "pacific") {
    const pacificSymbols = new Set(PACIFIC_PRIORITY_SYMBOLS as readonly string[]);
    return tokens.filter((t) => pacificSymbols.has(t.symbol));
  }
  const ids = new Set(CATEGORY_TOKEN_IDS[category]);
  return tokens.filter((t) => ids.has(t.coingecko_id));
}

/** Test-only: clears the in-memory cache between test cases. */
export function __resetCryptoRatesCacheForTests(): void {
  cache = null;
}
