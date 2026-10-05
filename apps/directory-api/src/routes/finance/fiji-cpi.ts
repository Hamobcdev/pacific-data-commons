import { Hono } from "hono";
import { getFijiCpi } from "../../services/fijiCpiService.js";
import { ValidationError } from "../../lib/errors.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 1 / $0.01, Decision 42 — governance/
// research endpoint over an openly-accessible government report, not
// Decision 59/60: this is transcribed directly from FBoS's own monthly CPI
// releases, not a wrapper over a third-party aggregator API). Same posture
// as fiji-gdp.ts. See services/fijiCpiService.ts for the full sourcing doc
// comment, including why only 3 months are covered.
export const fijiCpiRoute = new Hono<AppBindings>();

fijiCpiRoute.get("/finance/fiji-cpi", async (c) => {
  const yearParam = c.req.query("year");
  const from = c.req.query("from");
  const to = c.req.query("to");

  let year: number | undefined;
  if (yearParam !== undefined) {
    year = Number(yearParam);
    if (!Number.isInteger(year) || String(year).length !== 4) {
      throw new ValidationError("year must be a 4-digit integer, e.g. ?year=2026");
    }
  }
  if (from !== undefined && !/^\d{4}-\d{2}$/.test(from)) {
    throw new ValidationError("from must be in YYYY-MM format, e.g. ?from=2026-07");
  }
  if (to !== undefined && !/^\d{4}-\d{2}$/.test(to)) {
    throw new ValidationError("to must be in YYYY-MM format, e.g. ?to=2026-09");
  }

  const result = await getFijiCpi({ year, from, to });

  // No live upstream at all (fijiCpiService.ts) — same long cache as
  // fiji-gdp.ts, since this changes at most once per FBoS monthly release.
  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "Fiji Bureau of Statistics");
  c.header("X-Competition-Tag", "x402-global-challenge");

  return c.json(result);
});
