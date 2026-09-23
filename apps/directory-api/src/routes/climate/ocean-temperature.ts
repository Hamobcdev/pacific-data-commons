import { Hono } from "hono";
import { getPacificOceanClimate } from "../../services/pacificOceanClimateService.js";
import { AppError, ValidationError } from "../../lib/errors.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 1 / $0.01, Decisions 59/60 — a
// first-party utility wrapper over Open-Meteo's already-openly-accessible
// Marine Weather API, not a paywall on the underlying data). See
// services/pacificOceanClimateService.ts for the full sourcing/caching doc
// comment.
//
// Query params:
//   country (required) — ISO 3166-1 alpha-2: WS, FJ, TO, PG, SB, VU, CK
//
// country is required, not optional, for the same reason as
// pacific/weather.ts: Open-Meteo needs one specific lat/lon per call, so
// there's no sensible "all countries" response to aggregate across.
export const pacificOceanTemperatureRoute = new Hono<AppBindings>();

const VALID_COUNTRIES = new Set(["WS", "FJ", "TO", "PG", "SB", "VU", "CK"]);

pacificOceanTemperatureRoute.get("/climate/ocean-temperature", async (c) => {
  const country = c.req.query("country")?.toUpperCase();

  if (!country) {
    throw new ValidationError("country is required, e.g. ?country=WS");
  }
  if (!VALID_COUNTRIES.has(country)) {
    throw new ValidationError(`country must be one of: ${Array.from(VALID_COUNTRIES).join(", ")}`);
  }

  const oceanClimate = await getPacificOceanClimate(country);
  if (!oceanClimate) {
    // A valid country code with no data means Open-Meteo Marine itself was
    // unreachable/erroring this run — a third-party outage, not a server
    // error (matches pacific/weather.ts's identical posture).
    throw new AppError(503, "service_unavailable", "Ocean climate data is temporarily unavailable. Try again shortly.");
  }

  // 3-hour cache, same value mirrored here as a standard HTTP cache hint
  // (pacificOceanClimateService.ts's doc comment has the TTL reasoning) —
  // same pattern as samoa-cpi.ts's Cache-Control header.
  c.header("Cache-Control", "public, max-age=10800");

  return c.json(oceanClimate);
});
