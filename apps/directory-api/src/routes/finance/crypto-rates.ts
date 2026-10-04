import { Hono } from "hono";
import {
  getCryptoRatesSnapshot,
  tokensForCategory,
  PACIFIC_PRIORITY_SYMBOLS,
  SOURCE_ATTRIBUTION,
  COINGECKO_UPDATE_FREQUENCY_NOTE,
  VALID_CATEGORIES,
  type Category,
  type CryptoToken,
} from "../../services/pacificCryptoRatesService.js";
import { AppError, ValidationError } from "../../lib/errors.js";
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
export const pacificCryptoRatesRoute = new Hono<AppBindings>();

pacificCryptoRatesRoute.get("/finance/crypto-rates", async (c) => {
  const categoryRaw = c.req.query("category");
  let category: Category | undefined;
  if (categoryRaw !== undefined) {
    if (!(VALID_CATEGORIES as readonly string[]).includes(categoryRaw)) {
      throw new ValidationError(`category must be one of: ${VALID_CATEGORIES.join(", ")} (got "${categoryRaw}")`);
    }
    category = categoryRaw as Category;
  }

  const symbolsRaw = c.req.query("symbols");
  let requestedSymbols: string[] | undefined;
  if (symbolsRaw !== undefined) {
    requestedSymbols = symbolsRaw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);
  }

  const snapshot = await getCryptoRatesSnapshot();
  if (!snapshot) {
    throw new AppError(502, "bad_gateway", "Crypto price data is temporarily unavailable from CoinGecko. Try again shortly.");
  }

  let tokens: CryptoToken[] = snapshot.tokens;

  if (category) {
    tokens = tokensForCategory(tokens, category);
  }

  if (requestedSymbols) {
    const curatedSymbols = new Set(tokens.map((t) => t.symbol));
    const anyMatch = requestedSymbols.some((s) => curatedSymbols.has(s));
    if (!anyMatch) {
      throw new ValidationError(`None of the requested symbols are in the curated list: ${requestedSymbols.join(", ")}`);
    }
    const wanted = new Set(requestedSymbols);
    tokens = tokens.filter((t) => wanted.has(t.symbol));
  }

  // 60-second cache, same value mirrored here as a standard HTTP cache
  // hint (pacificCryptoRatesService.ts's doc comment has the TTL
  // reasoning).
  c.header("Cache-Control", "public, max-age=60");

  return c.json({
    tokens,
    total_tokens: tokens.length,
    data_currency: "real-time",
    coingecko_update_frequency: COINGECKO_UPDATE_FREQUENCY_NOTE,
    attribution: SOURCE_ATTRIBUTION,
    pacific_priority_tokens: PACIFIC_PRIORITY_SYMBOLS,
    fetch_warnings: snapshot.fetch_warnings,
    cached_at: snapshot.cached_at,
  });
});
