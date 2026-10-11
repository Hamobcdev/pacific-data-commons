import type { MiddlewareHandler } from "hono";
import { decodeAlgorandAddress } from "../lib/algorandAttestation.js";
import { ForbiddenError, ValidationError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { AppBindings } from "../types.js";

/**
 * Gates the Agent Dataset Gateway's query adapter (POST /api/v1/datasets/:id/query)
 * — the "permission-enforcing" half of Stream A, distinct from the x402
 * payment gate which only checks payment, not agent identity. Requires an
 * X-Agent-Wallet header naming a wallet already present in the `agents`
 * table (self-registered via POST /internal/agents/self-register, or
 * seeded as one of the six first-party marketplace agents) — an unknown
 * wallet is rejected before payment is even attempted.
 *
 * Looks up by existence only (`.limit(1)`, not `.maybeSingle()`) —
 * services/agentSelfRegisterService.ts's doc comment records that the
 * `agents` table has 6 rows sharing one dummy operational_wallet, and a
 * `.maybeSingle()` against a column multiple rows share throws PostgREST's
 * "multiple rows returned" error. This middleware only needs to know "does
 * at least one agent own this wallet," so that failure mode doesn't apply
 * here.
 */
export const requireKnownAgentWallet: MiddlewareHandler<AppBindings> = async (c, next) => {
  const rawWallet = c.req.header("x-agent-wallet");
  if (!rawWallet) {
    throw new ValidationError("Missing X-Agent-Wallet header");
  }

  const wallet = rawWallet.trim().toUpperCase();
  try {
    decodeAlgorandAddress(wallet);
  } catch {
    throw new ValidationError("X-Agent-Wallet is not a valid Algorand address");
  }

  const supabase = c.get("supabase");
  const { data, error } = await supabase.from("agents").select("id").eq("operational_wallet", wallet).limit(1);

  if (error) {
    logger.error("agent_wallet_lookup_failed", { error: error.message });
    throw new ForbiddenError("Could not verify agent wallet right now");
  }

  if (!data || data.length === 0) {
    throw new ForbiddenError("Unknown agent wallet — self-register via POST /internal/agents/self-register before using the Agent Dataset Gateway");
  }

  c.set("agentWallet", wallet);
  await next();
};
