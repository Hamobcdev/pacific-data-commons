import { Hono } from "hono";
import { getSamoaCpi } from "../../services/samoaCpiService.js";
import { ValidationError } from "../../lib/errors.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 1 / $0.01, Decisions 59/60 — a
// first-party utility wrapper over an already-openly-accessible World Bank
// series, not a paywall on the underlying data). See
// services/samoaCpiService.ts for the full sourcing/caching doc comment.
export const samoaCpiRoute = new Hono<AppBindings>();

samoaCpiRoute.get("/finance/samoa-cpi", async (c) => {
  const yearsParam = c.req.query("years");
  let years = 15;
  if (yearsParam !== undefined) {
    years = Number(yearsParam);
    if (!Number.isInteger(years) || years < 1 || years > 60) {
      throw new ValidationError("years must be an integer between 1 and 60");
    }
  }

  const result = await getSamoaCpi(years);

  // Annual data, cached server-side for 24h (samoaCpiService.ts) — same
  // value mirrored here as a standard HTTP cache hint so any HTTP-aware
  // agent/proxy can skip the round-trip entirely, same pattern as
  // discovery.ts/psr.ts's Cache-Control headers.
  c.header("Cache-Control", "public, max-age=86400");

  return c.json(result);
});
