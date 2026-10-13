import { Hono } from "hono";
import { getPacificCpi } from "../../services/spcPacificCpiService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 1 / $0.01, Decisions 59/60 — a
// first-party utility wrapper over an already-openly-accessible SPC SDMX
// series, not a paywall on the underlying data). See
// services/spcPacificCpiService.ts for the full sourcing/caching doc
// comment, including the SDMX dimension-filtering this route depends on.
export const pacificCpiRoute = new Hono<AppBindings>();

pacificCpiRoute.get("/finance/pacific-cpi", async (c) => {
  const result = await getPacificCpi();
  c.header("Cache-Control", "public, max-age=86400");
  return c.json(result);
});
