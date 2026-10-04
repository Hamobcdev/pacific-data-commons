import type { KVNamespace } from "@cloudflare/workers-types";
import { logger } from "../lib/logger.js";
import type { CryptoToken, CryptoPriceCronRecord } from "../services/pacificCryptoRatesService.js";

// cronCryptoPriceFetcher.ts
//
// Runs on worker.ts's `scheduled` export (wrangler.toml [triggers],
// */5 * * * *). CoinGecko is confirmed permanently blocked from
// Cloudflare Workers' outbound network (see pacificCryptoRatesService.ts's
// doc comment), so this uses two sources that ARE reachable from Workers:
// Binance (primary) and CoinCap (fallback), tried in order, stopping at
// the first that returns every curated symbol with a usable price.
//
// Deliberately covers only the 7-symbol set this codebase's static
// fallback already named (ALGO/BTC/ETH/XRP/XLM/USDC/USDT) — neither
// Binance's nor CoinCap's free APIs offer a single-call equivalent to
// CoinGecko's 67-token /coins/markets, so widening this to the full
// curated list is out of scope here, not an oversight.
//
// A source counts as "successful" only if ALL 5 non-stablecoin symbols
// resolve to a finite price — a partial result (one symbol missing or
// unparseable) is treated as that whole source having failed and the next
// source is tried, rather than writing a partial snapshot. If every
// source fails, this logs the failure and returns without touching KV at
// all — the existing "prices:current"/"history:*" entries are left alone,
// so a transient outage degrades to serving the last good snapshot, not a
// blank one.

const FETCH_TIMEOUT_MS = 10_000;
// 24h of history at a 5-minute cron interval.
const HISTORY_MAX_POINTS = 288;

// Fixed-literal-key Records (not Record<string, ...>) so a lookup keyed by
// a FetchedSymbol/TrackedSymbol-typed variable resolves to a known
// property, not a generic index-signature access — the latter would carry
// `| undefined` under this repo's noUncheckedIndexedAccess regardless of
// the key being a literal at the call site.
type FetchedSymbol = "ALGO" | "BTC" | "ETH" | "XRP" | "XLM";
type TrackedSymbol = FetchedSymbol | "USDC" | "USDT";

const FETCHED_SYMBOLS: readonly FetchedSymbol[] = ["ALGO", "BTC", "ETH", "XRP", "XLM"];

const BINANCE_PAIRS: Record<FetchedSymbol, string> = {
  ALGO: "ALGOUSDT",
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  XRP: "XRPUSDT",
  XLM: "XLMUSDT",
};

const COINCAP_IDS: Record<FetchedSymbol, string> = {
  ALGO: "algorand",
  BTC: "bitcoin",
  ETH: "ethereum",
  XRP: "ripple",
  XLM: "stellar",
};

const TOKEN_NAMES: Record<TrackedSymbol, string> = {
  ALGO: "Algorand",
  BTC: "Bitcoin",
  ETH: "Ethereum",
  XRP: "XRP",
  XLM: "Stellar",
  USDC: "USD Coin",
  USDT: "Tether",
};

// Same coingecko_id values pacificCryptoRatesService.ts's CURATED_TOKEN_IDS
// uses for these 7 symbols — kept identical so a CryptoToken from this cron
// feed is interchangeable with one from the live CoinGecko path or the
// static fallback.
const COINGECKO_IDS: Record<TrackedSymbol, string> = {
  ALGO: "algorand",
  BTC: "bitcoin",
  ETH: "ethereum",
  XRP: "ripple",
  XLM: "stellar",
  USDC: "usd-coin",
  USDT: "tether",
};

// USDC and USDT are always priced at 1.00 — never fetched, same posture as
// pacificCryptoRatesService.ts's static fallback never guessing a price.
function stablecoinTokens(): CryptoToken[] {
  return (["USDC", "USDT"] as const).map((symbol) => ({
    symbol,
    name: TOKEN_NAMES[symbol],
    coingecko_id: COINGECKO_IDS[symbol],
    price_usd: 1.0,
    change_24h_pct: 0,
    market_cap_usd: 0,
    volume_24h_usd: 0,
    market_cap_rank: null,
  }));
}

interface BinanceTicker24hr {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
}

/**
 * https://api.binance.com/api/v3/ticker/24hr with no ?symbol= returns
 * EVERY pair Binance lists (thousands) in one call — fetched once, then
 * filtered in-memory to the 5 curated pairs, same "one upstream call,
 * filter locally" shape as the CoinGecko path this replaces. Binance
 * doesn't publish market cap or rank on this endpoint, so those fields
 * are 0/null here — never a guessed figure, same "never fabricate" rule
 * pacificCryptoRatesService.ts applies throughout.
 */
async function fetchFromBinance(): Promise<CryptoToken[] | null> {
  try {
    const response = await fetch("https://api.binance.com/api/v3/ticker/24hr", { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;

    const tickers = (await response.json()) as BinanceTicker24hr[];
    const byPair = new Map(tickers.map((t) => [t.symbol, t]));

    const tokens: CryptoToken[] = [];
    for (const symbol of FETCHED_SYMBOLS) {
      const ticker = byPair.get(BINANCE_PAIRS[symbol]);
      const price = ticker ? Number(ticker.lastPrice) : NaN;
      if (!ticker || !Number.isFinite(price)) return null; // partial result -> whole source fails, try next
      tokens.push({
        symbol,
        name: TOKEN_NAMES[symbol],
        coingecko_id: COINGECKO_IDS[symbol],
        price_usd: price,
        change_24h_pct: Number(ticker.priceChangePercent) || 0,
        market_cap_usd: 0,
        volume_24h_usd: 0,
        market_cap_rank: null,
      });
    }
    return [...tokens, ...stablecoinTokens()];
  } catch (err) {
    logger.warn("crypto_price_cron_binance_failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

interface CoinCapAsset {
  id: string;
  priceUsd: string;
  changePercent24Hr: string;
  marketCapUsd: string | null;
  volumeUsd24Hr: string | null;
  rank: string | null;
}

/**
 * https://api.coincap.io/v2/assets, free, no key — same "one call, filter
 * locally" shape as fetchFromBinance above. Unlike Binance, CoinCap does
 * publish market cap/volume/rank, so those are populated here rather than
 * zeroed.
 */
async function fetchFromCoinCap(): Promise<CryptoToken[] | null> {
  try {
    const response = await fetch("https://api.coincap.io/v2/assets", { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;

    const body = (await response.json()) as { data: CoinCapAsset[] };
    const byId = new Map(body.data.map((a) => [a.id, a]));

    const tokens: CryptoToken[] = [];
    for (const symbol of FETCHED_SYMBOLS) {
      const asset = byId.get(COINCAP_IDS[symbol]);
      const price = asset ? Number(asset.priceUsd) : NaN;
      if (!asset || !Number.isFinite(price)) return null; // partial result -> whole source fails, try next
      tokens.push({
        symbol,
        name: TOKEN_NAMES[symbol],
        coingecko_id: COINGECKO_IDS[symbol],
        price_usd: price,
        change_24h_pct: Number(asset.changePercent24Hr) || 0,
        market_cap_usd: asset.marketCapUsd ? Number(asset.marketCapUsd) || 0 : 0,
        volume_24h_usd: asset.volumeUsd24Hr ? Number(asset.volumeUsd24Hr) || 0 : 0,
        market_cap_rank: asset.rank ? Number(asset.rank) : null,
      });
    }
    return [...tokens, ...stablecoinTokens()];
  } catch (err) {
    logger.warn("crypto_price_cron_coincap_failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export interface HistoryPoint {
  t: number;
  p: number;
}

/**
 * Reads the existing "history:{symbol}" array, appends one point, and
 * slices to the last HISTORY_MAX_POINTS before writing back — a rolling
 * 24h buffer at this cron's 5-minute interval. A read or write failure for
 * one symbol's history is logged and otherwise swallowed: it must never
 * block "prices:current" from being updated, or the other symbols' history
 * from being appended, for a single symbol's KV hiccup.
 */
async function appendHistoryPoint(kv: KVNamespace, symbol: string, priceUsd: number): Promise<void> {
  const key = `history:${symbol}`;
  try {
    const existing = (await kv.get<HistoryPoint[]>(key, { type: "json" })) ?? [];
    const next = [...existing, { t: Date.now(), p: priceUsd }].slice(-HISTORY_MAX_POINTS);
    await kv.put(key, JSON.stringify(next));
  } catch (err) {
    logger.warn("crypto_price_cron_history_append_failed", { symbol, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Entry point called from worker.ts's `scheduled` export. Tries Binance,
 * then CoinCap, stopping at the first full success; writes
 * "prices:current" and appends to every symbol's "history:{symbol}" on
 * success. On a double failure, logs and returns without writing
 * anything — see this file's top doc comment for why that's deliberate.
 */
export async function runCronCryptoPriceFetch(kv: KVNamespace): Promise<void> {
  let tokens = await fetchFromBinance();
  let source: CryptoPriceCronRecord["source"] = "binance";

  if (!tokens) {
    tokens = await fetchFromCoinCap();
    source = "coincap";
  }

  if (!tokens) {
    logger.error("crypto_price_cron_all_sources_failed", { attempted: ["binance", "coincap"] });
    return;
  }

  const record: CryptoPriceCronRecord = {
    updated_at: new Date().toISOString(),
    source,
    static_fallback: false,
    tokens,
  };

  await kv.put("prices:current", JSON.stringify(record));
  logger.info("crypto_price_cron_updated", { source, token_count: tokens.length });

  await Promise.all(tokens.map((token) => appendHistoryPoint(kv, token.symbol, token.price_usd)));
}
