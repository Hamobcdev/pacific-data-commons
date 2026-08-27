import { Hono } from "hono";
import { z } from "zod";
import { getCertifiedHashForEndpoint, recordIntegrityEvent } from "../services/integrityService.js";
import { dispatchUpdateNotifications } from "../services/notificationService.js";
import { selfRegisterAgent } from "../services/agentSelfRegisterService.js";
import { runHealthCheck } from "../services/healthCheckService.js";
import { generatePacificTravelBrief, AllTourismSubEndpointsFailedError } from "../services/pacificTourismService.js";
import { VALID_DESTINATIONS, VALID_TRAVEL_WINDOWS } from "./intelligence/pacific-travel.js";
import { internalAuth } from "../middleware/internalAuth.js";
import { AppError, ValidationError } from "../lib/errors.js";
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

/**
 * Session 24 — CLAUDE.md §6's "endpoint health checker (Railway cron,
 * every 5 min)". Intended caller is a Railway Cron Job configured in the
 * Railway dashboard (not expressible as a repo file) hitting this route on
 * schedule with the shared X-Internal-Api-Key secret — see
 * healthCheckService.ts's doc comment for the full design.
 */
internalRoute.post("/internal/health-check", async (c) => {
  const supabase = c.get("supabase");
  const summary = await runHealthCheck(supabase);
  return c.json(summary, 200);
});

const tourismDemoSchema = z.object({
  destination: z.string(),
  travel_window: z.string().optional(),
});

/**
 * Session 33 — backs the /en/demo/tourism STA demo page (apps/web). Same
 * generatePacificTravelBrief() call as the public x402-gated
 * GET /intelligence/pacific-travel, but reached via the service-to-service
 * /internal/* gate instead of a buyer payment: the demo page has no wallet
 * connection and pays nothing itself. The orchestrator still makes its own
 * 3 real sub-endpoint payments from the agent wallet either way — this
 * route only bypasses the *outer* x402 charge for the demo, not the
 * underlying Mainnet activity. apps/web's server action rate-limits calls
 * to this route (see actions/demo/tourism-brief.ts) precisely because each
 * call costs real USDC from SBP's own wallet with no offsetting payment.
 */
internalRoute.post("/internal/tourism-demo", async (c) => {
  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = tourismDemoSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(`Invalid tourism-demo request — ${parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ")}`);
  }

  const destination = parsed.data.destination.toUpperCase();
  const travelWindow = parsed.data.travel_window?.toLowerCase() ?? "next_90_days";

  if (!VALID_DESTINATIONS.has(destination)) {
    throw new ValidationError(`destination must be a Pacific ISO code: ${Array.from(VALID_DESTINATIONS).join(", ")}`);
  }
  if (!VALID_TRAVEL_WINDOWS.has(travelWindow)) {
    throw new ValidationError(`travel_window must be one of: ${Array.from(VALID_TRAVEL_WINDOWS).join(", ")}`);
  }

  const env = c.get("env");
  const supabase = c.get("supabase");

  if (!env.ANTHROPIC_API_KEY) {
    throw new AppError(503, "service_unavailable", "Travel intelligence synthesis service is not configured.");
  }
  if (!env.AGENT_WALLET_KEY) {
    throw new AppError(503, "service_unavailable", "Orchestrator payment wallet is not configured.");
  }

  try {
    const brief = await generatePacificTravelBrief({
      destination,
      travelWindow,
      supabase,
      agentWalletKey: env.AGENT_WALLET_KEY,
      network: env.ALGORAND_NETWORK,
      pilotEndpointUrl: env.PILOT_ENDPOINT_URL,
      publicUrl: env.PUBLIC_URL,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      claudeModel: env.CLAUDE_MODEL,
    });
    return c.json(brief, 200);
  } catch (err) {
    if (err instanceof AllTourismSubEndpointsFailedError) {
      throw new AppError(503, "endpoints_unavailable", "Pacific data endpoints are temporarily unavailable. Try again shortly.");
    }
    throw err;
  }
});
