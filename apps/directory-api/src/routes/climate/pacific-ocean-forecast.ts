import { Hono } from "hono";
import { getPacificOceanForecast } from "../../services/pacificOceanForecastService.js";
import { AppError } from "../../lib/errors.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 2 / $0.05, Decisions 59/60 — a
// first-party utility wrapper over HYCOM's already-openly-accessible
// THREDDS/OPeNDAP forecast product, not a paywall on the underlying
// data). See services/pacificOceanForecastService.ts for the full
// sourcing/caching doc comment, including why salinity_psu isn't in the
// response (no such variable exists in this dataset) and why the
// regional means are stride-sampled rather than exhaustive.
//
// No query params — returns today's forecast for the fixed Pacific
// Island bounding box.
//
// 502s (not 503, unlike this codebase's other first-party endpoints) on
// any upstream failure — deliberately chosen for this endpoint: a failed
// pointer fetch, a malformed pointer file, or a failed OPeNDAP fetch all
// mean THREDDS returned something this service couldn't use, which 502
// (Bad Gateway) describes more precisely than 503 (temporarily
// unavailable) for a request that made no client-side mistake.
export const pacificOceanForecastRoute = new Hono<AppBindings>();

pacificOceanForecastRoute.get("/climate/ocean-forecast", async (c) => {
  const result = await getPacificOceanForecast();
  if (!result) {
    throw new AppError(502, "bad_gateway", "Ocean forecast data is temporarily unavailable from the upstream THREDDS server. Try again shortly.");
  }

  // 6-hour cache, same value mirrored here as a standard HTTP cache hint
  // (pacificOceanForecastService.ts's doc comment has the TTL reasoning).
  c.header("Cache-Control", "public, max-age=21600");

  return c.json(result);
});
