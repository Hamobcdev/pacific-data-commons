import { Hono } from "hono";
import { getCertifiedHashForEndpoint, recordIntegrityEvent } from "../services/integrityService.js";
import { internalAuth } from "../middleware/internalAuth.js";
import { ValidationError } from "../lib/errors.js";
import type { AppBindings } from "../types.js";

/**
 * Session 17 (Deliverable 4) — service-to-service routes only. Never
 * registered with PdcPaymentGate, never listed in notFoundHandler's
 * available_routes. Placed flatly alongside every other directory-api
 * route (health.ts, search.ts, ...) rather than under a routes/internal/
 * subdirectory as the session brief's own draft path suggested — this app
 * has used one flat routes/ directory since Session 1 (see attribution.ts's
 * identical note); a one-off subdirectory for two files would be a new
 * convention here, not a fix.
 */
export const internalRoute = new Hono<AppBindings>();

internalRoute.use("/internal/*", internalAuth);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

internalRoute.get("/internal/certified-hash/:endpointId", async (c) => {
  const endpointId = c.req.param("endpointId");
  if (!UUID_RE.test(endpointId)) {
    throw new ValidationError(`"${endpointId}" is not a valid endpoint id`);
  }

  const supabase = c.get("supabase");
  const result = await getCertifiedHashForEndpoint(supabase, endpointId);
  return c.json(result);
});

internalRoute.post("/internal/integrity-event", async (c) => {
  const supabase = c.get("supabase");
  const env = c.get("env");
  const body: unknown = await c.req.json().catch(() => undefined);
  const result = await recordIntegrityEvent(supabase, env, body);
  return c.json(result, 201);
});
