import { Hono } from "hono";
import { queryFx } from "../../services/fxRateService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in index.ts (priceUsdc registered separately from this
// handler — same posture as walletBalanceRoute, search.ts, endpoint.ts).
// Pacific FX Registry — see fxRateService.ts's doc comment for the full
// source-verification record behind this endpoint's expansion.
//
// Query params:
//   (none)                        -> all rates, base USD
//   ?from=WST&to=USD&amount=100   -> converts 100 WST to USD (unchanged,
//     existing behaviour — takes precedence over the listing params below
//     if given together)
//   ?base=AUD                     -> all rates re-based to AUD instead of USD
//   ?pairs=WST,FJD                -> only these currencies in `rates`
//   ?pacific_only=true            -> only Pacific island currencies (+
//     ALGO/USDC, kept for backward compatibility) in `rates`; micro_state_pegs
//     is always present regardless
//
// Validation + both modes' logic live in fxRateService.ts's queryFx() so
// the Agent Dataset Gateway's query adapter can reuse it.
//
// Every response (both modes) now also carries: asset_categories (11
// crypto assets: major/stablecoin/remittance/gaming), crypto_24hr_change_pct,
// pacific_crypto_cross_rates (each of the 11 crypto assets priced against
// each of the 8 Pacific fiat currencies), and fetch_errors (per-asset
// CoinGecko fetch failures — a partial outage never fails the whole
// request). See fxRateService.ts's doc comment for source details.
export const fxRoute = new Hono<AppBindings>();

fxRoute.get("/finance/fx", async (c) => {
  const result = await queryFx({
    from: c.req.query("from"),
    to: c.req.query("to"),
    amount: c.req.query("amount"),
    base: c.req.query("base"),
    pairs: c.req.query("pairs"),
    pacificOnly: c.req.query("pacific_only"),
  });

  return c.json(result);
});
