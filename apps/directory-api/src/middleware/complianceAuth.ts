import type { MiddlewareHandler } from "hono";
import { AppError } from "../lib/errors.js";
import type { AppBindings } from "../types.js";

/**
 * Gates the /compliance/* AML/KYC stub routes (Session 38) — service-to-
 * service only, never public, never x402-gated. Callers send the shared
 * secret as `Authorization: Bearer <COMPLIANCE_API_KEY>`, a distinct header
 * scheme from /internal/*'s X-Internal-Api-Key (middleware/internalAuth.ts)
 * — the CBS escrow/compliance surface is a separate trust boundary with its
 * own secret, not a reuse of the agent/cron internal-routes key. Same
 * non-timing-safe posture as internalAuth.ts: one shared secret compared
 * against one env value, not a per-user credential.
 */
export const complianceAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const header = c.req.header("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  const expected = c.get("env").COMPLIANCE_API_KEY;

  if (!provided || provided !== expected) {
    throw new AppError(401, "unauthorized", "Missing or invalid Authorization: Bearer <COMPLIANCE_API_KEY> header");
  }

  await next();
};
