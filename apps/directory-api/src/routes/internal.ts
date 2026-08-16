import { Hono } from "hono";
import { z } from "zod";
import { getCertifiedHashForEndpoint, recordIntegrityEvent } from "../services/integrityService.js";
import { dispatchUpdateNotifications } from "../services/notificationService.js";
import { selfRegisterAgent } from "../services/agentSelfRegisterService.js";
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

const dispatchNotificationsSchema = z.object({
  endpoint_id: z.string().uuid("endpoint_id must be a UUID"),
  version_id: z.string().uuid("version_id must be a UUID"),
});

/**
 * Session 18 — called by apps/web's confirmUpdate() Server Action right
 * after it commits the new certified version to Supabase (see
 * routes/updates.ts's doc comment for why the write side of the declared-
 * update flow lives in apps/web rather than here). Synchronous, not
 * fire-and-forget: unlike the agent-query integrity path, this isn't in a
 * per-request payment hot path — the caller has already finished the thing
 * that matters (certifying the update) and can afford to wait for
 * dispatch to finish or fail loudly.
 */
internalRoute.post("/internal/dispatch-update-notifications", async (c) => {
  const supabase = c.get("supabase");
  const env = c.get("env");
  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = dispatchNotificationsSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(`Invalid dispatch request — ${parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ")}`);
  }

  await dispatchUpdateNotifications(supabase, env, parsed.data.endpoint_id, parsed.data.version_id);
  return c.json({ dispatched: true }, 200);
});

/**
 * Session 19 — self-registration for SBP-operated first-party agents (see
 * agentSelfRegisterService.ts's doc comment for why this exists and why it
 * isn't an upsert). Called by apps/sbp-agent once at boot.
 */
internalRoute.post("/internal/agents/self-register", async (c) => {
  const supabase = c.get("supabase");
  const body: unknown = await c.req.json().catch(() => undefined);
  const result = await selfRegisterAgent(supabase, body);
  return c.json(result, 200);
});
