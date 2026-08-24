import { Hono } from "hono";
import { getFxRates } from "../../services/fxRateService.js";
import { ValidationError } from "../../lib/errors.js";
import type { AppBindings } from "../../types.js";

// x402-gated in index.ts (priceUsdc registered separately from this
// handler — same posture as walletBalanceRoute, search.ts, endpoint.ts).
//
// Query params:
//   (none)                      -> all Pacific FX rates, base USD
//   ?from=WST&to=USD&amount=100 -> converts 100 WST to USD
export const fxRoute = new Hono<AppBindings>();

const SUPPORTED_CURRENCIES = new Set(["WST", "FJD", "TOP", "PGK", "SBD", "VUV", "AUD", "NZD", "EUR", "GBP", "JPY", "CNY", "USD", "ALGO", "USDC"]);

fxRoute.get("/finance/fx", async (c) => {
  const from = c.req.query("from")?.toUpperCase();
  const to = c.req.query("to")?.toUpperCase();
  const amountStr = c.req.query("amount");

  const anyConversionParam = from !== undefined || to !== undefined || amountStr !== undefined;

  if (!anyConversionParam) {
    const result = await getFxRates();
    return c.json(result);
  }

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
});
