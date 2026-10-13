import { Hono } from "hono";
import { getPacificPopulation, parseYearsParam } from "../../services/worldBankPacificPopulationService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 1 / $0.01, Decisions 59/60 — a
// first-party utility wrapper over an already-openly-accessible World Bank
// series, not a paywall on the underlying data). See
// services/worldBankPacificPopulationService.ts for the full
// sourcing/caching doc comment. First route under /demographics — lib/
// dataCategories.ts's DATA_CATEGORIES already carries "demographics" as a
// valid category; no route had used that path prefix before this one.
export const pacificPopulationRoute = new Hono<AppBindings>();

pacificPopulationRoute.get("/demographics/pacific-population", async (c) => {
  const years = parseYearsParam(c.req.query("years"));
  const result = await getPacificPopulation(years);
  c.header("Cache-Control", "public, max-age=86400");
  return c.json(result);
});
