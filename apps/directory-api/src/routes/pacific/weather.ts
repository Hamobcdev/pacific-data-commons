import { Hono } from "hono";
import { getPacificWeather } from "../../services/pacificWeatherService.js";
import { AppError, ValidationError } from "../../lib/errors.js";
import type { AppBindings } from "../../types.js";

// x402-gated in index.ts (priceUsdc registered separately from this
// handler — same posture as fxRoute, pacificEventsRoute).
//
// Query params:
//   country (required) — ISO 3166-1 alpha-2: WS, FJ, TO, PG, SB, VU, CK
//
// Unlike /pacific/events, country is required here rather than optional —
// Open-Meteo needs one specific lat/lon per call, so there's no sensible
// "all countries" weather response the way events can aggregate across
// the whole region (Session 34 intelligence-phase decision).
export const pacificWeatherRoute = new Hono<AppBindings>();

const VALID_COUNTRIES = new Set(["WS", "FJ", "TO", "PG", "SB", "VU", "CK"]);

pacificWeatherRoute.get("/pacific/weather", async (c) => {
  const country = c.req.query("country")?.toUpperCase();

  if (!country) {
    throw new ValidationError("country is required, e.g. ?country=WS");
  }
  if (!VALID_COUNTRIES.has(country)) {
    throw new ValidationError(`country must be one of: ${Array.from(VALID_COUNTRIES).join(", ")}`);
  }

  const weather = await getPacificWeather(country);
  if (!weather) {
    // A valid country code with no data means Open-Meteo itself was
    // unreachable/erroring this run — a third-party outage, not a server
    // error, so 503 rather than 500 (matches pacific-brief/pacific-travel's
    // AllSubEndpointsFailedError -> 503 posture for the same reason).
    throw new AppError(503, "service_unavailable", "Weather data is temporarily unavailable. Try again shortly.");
  }

  return c.json(weather);
});
