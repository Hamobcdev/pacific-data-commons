import { Hono } from "hono";
import { getFijiCpi, parseFijiCpiParams } from "../../services/fijiCpiService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 1 / $0.01, Decision 42 — governance/
// research endpoint over an openly-accessible government report, not
// Decision 59/60: this is transcribed directly from FBoS's own monthly CPI
// releases, not a wrapper over a third-party aggregator API). Same posture
// as fiji-gdp.ts. See services/fijiCpiService.ts for the full sourcing doc
// comment, including why only 3 months are covered.
export const fijiCpiRoute = new Hono<AppBindings>();

fijiCpiRoute.get("/finance/fiji-cpi", async (c) => {
  const filters = parseFijiCpiParams(c.req.query("year"), c.req.query("from"), c.req.query("to"));

  const result = await getFijiCpi(filters);

  // No live upstream at all (fijiCpiService.ts) — same long cache as
  // fiji-gdp.ts, since this changes at most once per FBoS monthly release.
  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "Fiji Bureau of Statistics");
  c.header("X-Competition-Tag", "x402-global-challenge");

  return c.json(result);
});
