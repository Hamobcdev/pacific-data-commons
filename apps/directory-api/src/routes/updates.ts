import { Hono } from "hono";
import { getVersionHistory } from "../services/versionService.js";
import { ValidationError } from "../lib/errors.js";
import type { AppBindings } from "../types.js";

/**
 * Session 18 — only Route 3 of the session brief's Deliverable 2 lives here.
 * Routes 1-2 (declare-update, confirm-update) are provider-authenticated
 * writes; this codebase has no provider-JWT-to-directory-api auth path
 * anywhere (every provider write is a Next.js Server Action using
 * getResumedProvider() + createServiceClient() — see apps/web/actions/
 * onboarding/save-provenance.ts for the established pattern). Building
 * those as apps/web Server Actions (apps/web/actions/dashboard/
 * declare-update.ts, confirm-update.ts) instead of inventing a new
 * directory-api auth mechanism this session — flagged in the session
 * report. This route stays public/unauthenticated, matching /endpoint/:id.
 */
export const updatesRoute = new Hono<AppBindings>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

updatesRoute.get("/endpoints/:endpointId/versions", async (c) => {
  const endpointId = c.req.param("endpointId");
  if (!UUID_RE.test(endpointId)) {
    throw new ValidationError(`"${endpointId}" is not a valid endpoint id`);
  }

  const supabase = c.get("supabase");
  const result = await getVersionHistory(supabase, endpointId);
  return c.json(result);
});
