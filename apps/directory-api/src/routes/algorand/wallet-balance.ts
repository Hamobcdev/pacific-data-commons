import { Hono } from "hono";
import { getAlgorandWalletBalance, isValidAlgorandAddress } from "../../services/algorandBalanceService.js";
import { ValidationError } from "../../lib/errors.js";
import type { AppBindings } from "../../types.js";

export const walletBalanceRoute = new Hono<AppBindings>();

// x402-gated in index.ts (priceUsdc registered separately from this
// handler — see PdcPaymentGate.addRoute in index.ts). This handler contains
// no payment logic itself, same posture as every other paid route in this
// app (search.ts, endpoint.ts, provider.ts, verify.ts).
walletBalanceRoute.get("/algorand/wallet-balance", async (c) => {
  const address = c.req.query("address");

  if (!address) {
    throw new ValidationError("address query parameter is required, e.g. ?address=ALGORAND_ADDRESS_58_CHARS");
  }
  if (!isValidAlgorandAddress(address)) {
    throw new ValidationError(`"${address}" is not a valid 58-character Algorand address`);
  }

  const env = c.get("env");
  const result = await getAlgorandWalletBalance(address, env);
  return c.json(result);
});
