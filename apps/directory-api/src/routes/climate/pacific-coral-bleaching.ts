import { Hono } from "hono";
import { getCoralBleaching, DEFAULT_LAT, DEFAULT_LON, DEFAULT_RADIUS_DEG } from "../../services/pacificCoralBleachingService.js";
import { AppError, ValidationError } from "../../lib/errors.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 2 / $0.05, Decisions 59/60 — a
// first-party utility wrapper over NOAA Coral Reef Watch's already-
// openly-accessible CoralTemp product, not a paywall on the underlying
// data). See services/pacificCoralBleachingService.ts for the full
// sourcing doc comment, including why this talks to ERDDAP rather than
// the THREDDS endpoint named first in this route's build brief (THREDDS
// was confirmed live during this session to be unreliable and to give
// untrustworthy time-index results), and why it uses ERDDAP's .csv
// fileType rather than .ascii (.ascii returns a live HTTP 400 for this
// specific dataset; .csv on the identical query works).
//
// Query params (all optional):
//   lat (default -13.759, Samoa) — decimal degrees, -90..90
//   lon (default -172.104, Samoa) — decimal degrees, -180..180
//   radius_deg (default 2.0) — bounding box half-width in degrees, 0.1..10
export const pacificCoralBleachingRoute = new Hono<AppBindings>();

pacificCoralBleachingRoute.get("/climate/pacific-coral-bleaching", async (c) => {
  const latRaw = c.req.query("lat");
  let lat = DEFAULT_LAT;
  if (latRaw !== undefined) {
    lat = Number(latRaw);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new ValidationError("lat must be a number between -90 and 90");
    }
  }

  const lonRaw = c.req.query("lon");
  let lon = DEFAULT_LON;
  if (lonRaw !== undefined) {
    lon = Number(lonRaw);
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      throw new ValidationError("lon must be a number between -180 and 180");
    }
  }

  const radiusRaw = c.req.query("radius_deg");
  let radiusDeg = DEFAULT_RADIUS_DEG;
  if (radiusRaw !== undefined) {
    radiusDeg = Number(radiusRaw);
    if (!Number.isFinite(radiusDeg) || radiusDeg < 0.1 || radiusDeg > 10) {
      throw new ValidationError("radius_deg must be a number between 0.1 and 10");
    }
  }

  const result = await getCoralBleaching(lat, lon, radiusDeg);
  if (!result) {
    // A valid request with no result means either the upstream ERDDAP
    // server was unreachable/erroring this run, or the entire requested
    // region is land/missing data — a third-party/upstream-data problem,
    // not a server error (matches pacific-ocean-forecast.ts's 502
    // posture, used deliberately in this endpoint too per its own brief).
    throw new AppError(502, "bad_gateway", "Coral bleaching data is temporarily unavailable from the upstream ERDDAP server. Try again shortly.");
  }

  // 24-hour cache, same value mirrored here as a standard HTTP cache hint
  // (pacificCoralBleachingService.ts's doc comment has the TTL reasoning).
  c.header("Cache-Control", "public, max-age=86400");

  return c.json(result);
});
