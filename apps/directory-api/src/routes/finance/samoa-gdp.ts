import { Hono } from "hono";
import { getSamoaGdp, parseSamoaGdpParams } from "../../services/samoaGdpService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 1 / $0.01, Decision 42 — governance/
// research endpoint over an openly-accessible government report, not
// Decision 59/60: this is transcribed directly from SBS's own publication,
// not a wrapper over a third-party aggregator API). See
// services/samoaGdpService.ts for the full sourcing doc comment.
export const samoaGdpRoute = new Hono<AppBindings>();

samoaGdpRoute.get("/finance/samoa-gdp", async (c) => {
  const { fiscalYear, all } = parseSamoaGdpParams(c.req.query("fiscal_year"), c.req.query("all"));

  const result = await getSamoaGdp(fiscalYear, all);

  // Annual data with no live upstream at all (samoaGdpService.ts) — a
  // longer cache than samoa-cpi's 24h, since this changes at most once a
  // year and SBS publishes on no fixed schedule PDC can poll against.
  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "Samoa Bureau of Statistics");
  c.header("X-Competition-Tag", "x402-global-challenge");

  return c.json(result);
});
