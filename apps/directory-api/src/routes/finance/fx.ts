import { Hono } from "hono";
import { getFxRates, rebaseRates, PACIFIC_CURRENCIES, MICRO_STATE_PEGS } from "../../services/fxRateService.js";
import { ValidationError } from "../../lib/errors.js";
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
export const fxRoute = new Hono<AppBindings>();

const SUPPORTED_CURRENCIES = new Set(["WST", "FJD", "TOP", "PGK", "SBD", "VUV", "XPF", "KHR", "AUD", "NZD", "EUR", "GBP", "JPY", "CNY", "SGD", "CAD", "HKD", "USD", "ALGO", "USDC"]);

fxRoute.get("/finance/fx", async (c) => {
  const from = c.req.query("from")?.toUpperCase();
  const to = c.req.query("to")?.toUpperCase();
  const amountStr = c.req.query("amount");

  const anyConversionParam = from !== undefined || to !== undefined || amountStr !== undefined;

  if (anyConversionParam) {
    if (!from || !to || !amountStr) {
      throw new ValidationError("Conversion requires from, to, and amount query parameters, e.g. ?from=WST&to=USD&amount=100");
    }
    if (!SUPPORTED_CURRENCIES.has(from)) {
      throw new ValidationError(`"${from}" is not a supported currency. Supported: ${Array.from(SUPPORTED_CURRENCIES).join(", ")}`);
    }
    if (!SUPPORTED_CURRENCIES.has(to)) {
      throw new ValidationError(`"${to}" is not a supported currency. Supported: ${Array.from(SUPPORTED_CURRENCIES).join(", ")}`);
    }

    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError("amount must be a positive number");
    }

    const result = await getFxRates(from, to, amount);
    return c.json(result);
  }

  const baseRaw = c.req.query("base")?.toUpperCase();
  if (baseRaw !== undefined && !SUPPORTED_CURRENCIES.has(baseRaw)) {
    throw new ValidationError(`"${baseRaw}" is not a supported base currency. Supported: ${Array.from(SUPPORTED_CURRENCIES).join(", ")}`);
  }

  const pairsRaw = c.req.query("pairs");
  let requestedPairs: string[] | undefined;
  if (pairsRaw !== undefined) {
    requestedPairs = pairsRaw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);
    const unsupported = requestedPairs.filter((p) => !SUPPORTED_CURRENCIES.has(p));
    if (unsupported.length > 0) {
      throw new ValidationError(`Unsupported currency in ?pairs=: ${unsupported.join(", ")}. Supported: ${Array.from(SUPPORTED_CURRENCIES).join(", ")}`);
    }
  }

  const pacificOnly = c.req.query("pacific_only")?.toLowerCase() === "true";

  const snapshot = await getFxRates();
  const base = baseRaw ?? "USD";
  const ratesForBase = base === "USD" ? snapshot.rates : rebaseRates(snapshot.rates, base);

  let filteredRates: Record<string, number> = ratesForBase;
  if (pacificOnly) {
    const keep = new Set<string>([...(PACIFIC_CURRENCIES as readonly string[]), "ALGO", "USDC"]);
    filteredRates = Object.fromEntries(Object.entries(filteredRates).filter(([code]) => keep.has(code)));
  }
  if (requestedPairs) {
    const keep = new Set(requestedPairs);
    filteredRates = Object.fromEntries(Object.entries(filteredRates).filter(([code]) => keep.has(code)));
  }

  return c.json({
    ...snapshot,
    base,
    rates: filteredRates,
    micro_state_pegs: MICRO_STATE_PEGS,
  });
});
