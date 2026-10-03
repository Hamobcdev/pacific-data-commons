import { Hono } from "hono";
import { getSamoaGdp, SUPPORTED_FISCAL_YEARS } from "../../services/samoaGdpService.js";
import { ValidationError } from "../../lib/errors.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 1 / $0.01, Decision 42 — governance/
// research endpoint over an openly-accessible government report, not
// Decision 59/60: this is transcribed directly from SBS's own publication,
// not a wrapper over a third-party aggregator API). See
// services/samoaGdpService.ts for the full sourcing doc comment.
export const samoaGdpRoute = new Hono<AppBindings>();

samoaGdpRoute.get("/finance/samoa-gdp", async (c) => {
  const fiscalYear = c.req.query("fiscal_year");
  const all = c.req.query("all") === "true";

  if (fiscalYear !== undefined && !SUPPORTED_FISCAL_YEARS.includes(fiscalYear)) {
    throw new ValidationError(`fiscal_year must be one of: ${SUPPORTED_FISCAL_YEARS.join(", ")}`);
  }

  const result = await getSamoaGdp(fiscalYear, all);

  // Annual data with no live upstream at all (samoaGdpService.ts) — a
  // longer cache than samoa-cpi's 24h, since this changes at most once a
  // year and SBS publishes on no fixed schedule PDC can poll against.
  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "Samoa Bureau of Statistics");
  c.header("X-Competition-Tag", "x402-global-challenge");

  return c.json(result);
});
