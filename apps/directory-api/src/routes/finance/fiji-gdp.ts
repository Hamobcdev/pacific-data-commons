import { Hono } from "hono";
import { getFijiGdp, SUPPORTED_YEARS, VALID_MEASURES, DEFAULT_MEASURE, type FijiGdpMeasure } from "../../services/fijiGdpService.js";
import { ValidationError } from "../../lib/errors.js";
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
  const year = c.req.query("year");
  if (!year) {
    throw new ValidationError(`year is required, e.g. ?year=2019 (supported years: ${SUPPORTED_YEARS.join(", ")})`);
  }
  if (!SUPPORTED_YEARS.includes(year)) {
    throw new ValidationError(`year must be one of: ${SUPPORTED_YEARS.join(", ")} (got "${year}")`);
  }

  const measureRaw = c.req.query("measure") ?? DEFAULT_MEASURE;
  if (!(VALID_MEASURES as readonly string[]).includes(measureRaw)) {
    throw new ValidationError(`measure must be one of: ${VALID_MEASURES.join(", ")} (got "${measureRaw}")`);
  }

  const result = await getFijiGdp(year, measureRaw as FijiGdpMeasure);

  // Annual data with no live upstream at all (fijiGdpService.ts) — same
  // long cache as samoa-gdp.ts, since this changes at most once per FBoS
  // release and there's no fixed publication schedule to poll against.
  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "Fiji Bureau of Statistics");
  c.header("X-Competition-Tag", "x402-global-challenge");

  return c.json(result);
});
