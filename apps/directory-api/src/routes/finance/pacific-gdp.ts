import { Hono } from "hono";
import { getPacificGdp, parseYearsParam } from "../../services/worldBankPacificGdpService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 1 / $0.01, Decisions 59/60 — a
// first-party utility wrapper over an already-openly-accessible World Bank
// series, not a paywall on the underlying data). See
// services/worldBankPacificGdpService.ts for the full sourcing/caching doc
// comment.
export const pacificGdpRoute = new Hono<AppBindings>();

pacificGdpRoute.get("/finance/pacific-gdp", async (c) => {
  const years = parseYearsParam(c.req.query("years"));
  const result = await getPacificGdp(years);
  c.header("Cache-Control", "public, max-age=86400");
  return c.json(result);
});
