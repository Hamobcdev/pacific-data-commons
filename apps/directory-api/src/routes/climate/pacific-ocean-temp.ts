import { Hono } from "hono";
import { getPacificWaterTemperature, DEFAULT_STATION, VALID_STATIONS, isValidStation } from "../../services/pacificWaterTemperatureService.js";
import { AppError, ValidationError } from "../../lib/errors.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 1 / $0.01, Decisions 59/60 — a
// first-party utility wrapper over NOAA CO-OPS's already-openly-accessible
// Tides & Currents Data Getter API, not a paywall on the underlying data).
// See services/pacificWaterTemperatureService.ts for the full
// sourcing/caching doc comment, including why this replaced an earlier
// Pacific Data Hub (pacificdata.org) CKAN plan — that API's query-string
// requests are behind a Cloudflare challenge that a server-side fetch
// can't pass.
//
// Query params:
//   station (optional) — NOAA station id: 1770000 (Pago Pago, American
//     Samoa) or 1617760 (Honolulu, Hawaii). Default 1770000.
export const pacificWaterTemperatureRoute = new Hono<AppBindings>();

pacificWaterTemperatureRoute.get("/climate/water-temperature", async (c) => {
  const station = c.req.query("station") ?? DEFAULT_STATION;

  if (!isValidStation(station)) {
    throw new ValidationError(`station must be one of: ${VALID_STATIONS.join(", ")}`);
  }

  const waterTemperature = await getPacificWaterTemperature(station);
  if (!waterTemperature) {
    // A valid station with no data means NOAA CO-OPS itself was
    // unreachable/erroring this run — a third-party outage, not a server
    // error (matches ocean-temperature.ts's identical posture).
    throw new AppError(503, "service_unavailable", "Water temperature data is temporarily unavailable. Try again shortly.");
  }

  // 30-minute cache, same value mirrored here as a standard HTTP cache
  // hint (pacificWaterTemperatureService.ts's doc comment has the TTL
  // reasoning) — same pattern as ocean-temperature.ts's Cache-Control
  // header.
  c.header("Cache-Control", "public, max-age=1800");

  return c.json(waterTemperature);
});
