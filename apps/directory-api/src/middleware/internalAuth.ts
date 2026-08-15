import type { MiddlewareHandler } from "hono";
import { AppError } from "../lib/errors.js";
import type { AppBindings } from "../types.js";

/**
 * Gates the /internal/* routes (Session 17, Deliverable 4) — service-to-
 * service only, never public, never x402-gated. Callers (apps/agents, and
 * eventually the endpoint health checker cron) send the shared secret in
 * X-Internal-Api-Key. Timing-safe comparison isn't used here: this is a
 * single shared secret compared server-side against one env value, not a
 * per-user credential where remote timing attacks are the realistic threat
 * model this repo is otherwise defending (cf. algorandAttestation.ts's
 * actual signature verification).
 */
export const internalAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const provided = c.req.header("x-internal-api-key");
  const expected = c.get("env").INTERNAL_API_KEY;

  if (!provided || provided !== expected) {
    throw new AppError(401, "unauthorized", "Missing or invalid X-Internal-Api-Key header");
  }

  await next();
};
