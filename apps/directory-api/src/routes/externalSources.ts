import { Hono } from "hono";
import { listActiveExternalSources } from "../services/externalSourcesService.js";
import type { AppBindings } from "../types.js";

export const externalSourcesRoute = new Hono<AppBindings>();

/** Public, free — never registered with PdcPaymentGate, same posture as
 * /categories and /countries (Session 19 / Decision 56). */
externalSourcesRoute.get("/external-sources", async (c) => {
  const supabase = c.get("supabase");
  const sources = await listActiveExternalSources(supabase);
  return c.json({ sources });
});
