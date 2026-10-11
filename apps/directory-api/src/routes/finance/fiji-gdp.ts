import { Hono } from "hono";
import { getFijiGdp, parseFijiGdpParams } from "../../services/fijiGdpService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 1 / $0.01, Decision 42 — governance/
// research endpoint over an openly-accessible government report, not
// Decision 59/60: this is transcribed directly from FBoS's own
// publication, not a wrapper over a third-party aggregator API). Same
// posture as samoa-gdp.ts. See services/fijiGdpService.ts for the full
// sourcing doc comment, including why only 2019 has an industry
// breakdown.
export const fijiGdpRoute = new Hono<AppBindings>();

fijiGdpRoute.get("/finance/fiji-gdp", async (c) => {
  const { year, measure } = parseFijiGdpParams(c.req.query("year"), c.req.query("measure"));

  const result = await getFijiGdp(year, measure);

  // Annual data with no live upstream at all (fijiGdpService.ts) — same
  // long cache as samoa-gdp.ts, since this changes at most once per FBoS
  // release and there's no fixed publication schedule to poll against.
  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "Fiji Bureau of Statistics");
  c.header("X-Competition-Tag", "x402-global-challenge");

  return c.json(result);
});
