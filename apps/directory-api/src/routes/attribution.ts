import { Hono } from "hono";
import { submitAttribution } from "../services/attributionService.js";
import type { AppBindings } from "../types.js";

export const attributionRoute = new Hono<AppBindings>();

/**
 * POST /agent/attribution — Decision 37 (CLAUDE.md v2.2). Every marketplace
 * agent must submit a wallet-signed attribution record after each run.
 * FREE — no x402 payment gate, never registered via paymentGate.addRoute()
 * in index.ts. Attribution is a compliance requirement, not a paid service.
 *
 * Placed flatly alongside every other directory-api route (health, search,
 * verify, discovery, ...) rather than under a routes/free/ subdirectory —
 * that split exists in apps/pilot-endpoint, which also has routes/paid/ to
 * separate from. directory-api has used one flat routes/ directory for
 * every route since Session 1 (see discovery.ts's identical note); adding a
 * one-off free/ subdirectory here for a single file would be a new
 * convention for this app, not a fix.
 */
attributionRoute.post("/agent/attribution", async (c) => {
  const supabase = c.get("supabase");
  const body: unknown = await c.req.json().catch(() => undefined);
  const result = await submitAttribution(supabase, body);
  return c.json({ attribution: result }, 201);
});
