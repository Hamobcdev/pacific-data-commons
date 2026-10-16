import { Hono } from "hono";
import { logger } from "../../lib/logger.js";
import { paidRoutes } from "../../routeSchemas.js";
import type { AppBindings } from "../../types.js";
import { samoaEntitySetupRoute } from "../pacific/samoa-entity-setup.js";
import { samoaComplianceStatusRoute } from "../pacific/samoa-compliance-status.js";
import { samoaServiceProvidersRoute } from "../pacific/samoa-service-providers.js";
import { samoaBankingSetupRoute } from "../pacific/samoa-banking-setup.js";
import { pacificSetupComparisonRoute } from "../invest/pacific-setup-comparison.js";
import { pacificTaxComparisonRoute } from "../invest/pacific-tax-comparison.js";
import { pacificLandTenureRoute } from "../invest/pacific-land-tenure.js";
import { pacificSectorRestrictionsRoute } from "../invest/pacific-sector-restrictions.js";
import { pacificRegulatoryScoresRoute } from "../invest/pacific-regulatory-scores.js";
import { pacificSetupChecklistRoute } from "../invest/pacific-setup-checklist.js";

/**
 * Human payment rail (competition, simplified flow) — internal-only data
 * delivery for the token-gated download page. apps/web's download page
 * calls GET /internal/data/<path> with X-Internal-Key after confirming a
 * valid, unredeemed download_token — never exposed to buyers directly.
 *
 * Deliberately NOT reusing middleware/dashboardBypass.ts's bypass: that
 * module's own doc comment is explicit that it's scoped to exactly 5
 * finance paths so a leaked DASHBOARD_INTERNAL_KEY exposes at most those
 * 5 endpoints, not the whole platform's revenue surface. Widening that
 * allowlist to arbitrary paid routes would quietly undo that boundary.
 * This route reuses the same secret VALUE (env.DASHBOARD_INTERNAL_KEY)
 * and the same "compare header to one env var, fail closed" pattern, but
 * is its own, separately-scoped check restricted to the routes in
 * INTERNAL_DATA_FETCH_ROUTES below.
 *
 * Dispatch is a small explicit map, not a generic "call whatever path was
 * requested" — only the 10 Samoa Jurisdiction Intelligence + Pacific
 * Investment Intelligence routes are wired here, because those are the
 * only paid routes this human-payment flow currently targets, and because
 * calling an arbitrary route's Hono sub-app via .request() skips the main
 * app's bootstrap middleware (app.ts's `c.set("env", ...)` /
 * `c.set("supabase", ...)`) — safe for these 10, which are static
 * in-memory data with no c.var usage, but NOT safe in general for routes
 * that read c.var.supabase/env/cryptoPricesKv. Extend this map (and
 * confirm the target route doesn't need those bindings) before relying on
 * this for anything else.
 */
const INTERNAL_DATA_FETCH_ROUTES: Record<string, Hono<AppBindings>> = {
  "/pacific/samoa-entity-setup": samoaEntitySetupRoute,
  "/pacific/samoa-compliance-status": samoaComplianceStatusRoute,
  "/pacific/samoa-service-providers": samoaServiceProvidersRoute,
  "/pacific/samoa-banking-setup": samoaBankingSetupRoute,
  "/invest/pacific-setup-comparison": pacificSetupComparisonRoute,
  "/invest/pacific-tax-comparison": pacificTaxComparisonRoute,
  "/invest/pacific-land-tenure": pacificLandTenureRoute,
  "/invest/pacific-sector-restrictions": pacificSectorRestrictionsRoute,
  "/invest/pacific-regulatory-scores": pacificRegulatoryScoresRoute,
  "/invest/pacific-setup-checklist": pacificSetupChecklistRoute,
};

export const internalDataFetchRoute = new Hono<AppBindings>();

internalDataFetchRoute.get("/internal/data/*", async (c) => {
  const configuredKey = c.var.env.DASHBOARD_INTERNAL_KEY;
  const providedKey = c.req.header("x-internal-key");
  if (!configuredKey || !providedKey || providedKey !== configuredKey) {
    logger.info("internal_data_fetch_forbidden", { path: c.req.path });
    return c.json({ error: "Forbidden." }, 403);
  }

  const targetPath = c.req.path.replace(/^\/internal\/data/, "");
  const isRegisteredPaidRoute = paidRoutes.some((r) => r.method === "GET" && r.path === targetPath);
  if (!isRegisteredPaidRoute) {
    return c.json({ error: "Not found." }, 404);
  }

  const subApp = INTERNAL_DATA_FETCH_ROUTES[targetPath];
  if (!subApp) {
    logger.error("internal_data_fetch_not_wired", { path: targetPath });
    return c.json({ error: "This path exists but is not yet wired for internal delivery." }, 501);
  }

  const url = new URL(c.req.url);
  const forwardPath = `${targetPath}${url.search}`;
  return subApp.request(forwardPath);
});
