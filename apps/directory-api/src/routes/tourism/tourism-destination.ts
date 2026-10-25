import { Hono } from "hono";
import {
  getDestinationByNationCode,
  getPacificDestinations,
  getDestinationProfile,
  getDestinationAdvisories,
  parseFieldsParam,
} from "../../services/tourismDestinationService.js";
import type { AppBindings } from "../../types.js";

// VITE_FLAG_LIVE_RPC_ACTIVE=false (not applicable to this Worker route file,
// noted per CLAUDE.md hard rule).
//
// x402-gated in routeSchemas.ts (never call @x402 packages directly from a
// route file — this price constant is imported there and used as that
// entry's priceUsdc, same pattern as SAMOA_CPI_PRICE_USDC).
//
// Pacific Tourism Data Framework — Phase A Decision Register (see
// supabase/migrations/20261026000001_pacific_tourism_schema.sql).
export const TOURISM_DESTINATION_PRICE_USDC = 0.1;

export const tourismDestinationRoute = new Hono<AppBindings>();

// Most specific static path first — /pacific is a sibling of :nation_code
// at the same depth, Hono's router resolves this correctly regardless of
// registration order, but listing it first keeps intent readable.
tourismDestinationRoute.get("/tourism/destinations/pacific", async (c) => {
  const fields = parseFieldsParam(c.req.query("fields"));
  const region = c.req.query("region");
  const results = await getPacificDestinations(c.get("supabase"), { region, fields });
  return c.json({ results, count: results.length });
});

tourismDestinationRoute.get("/tourism/destination/:nation_code/profile", async (c) => {
  const profile = await getDestinationProfile(c.get("supabase"), c.req.param("nation_code"));
  return c.json(profile);
});

tourismDestinationRoute.get("/tourism/destination/:nation_code/advisories", async (c) => {
  const advisories = await getDestinationAdvisories(c.get("supabase"), c.req.param("nation_code"));
  return c.json(advisories);
});

tourismDestinationRoute.get("/tourism/destination/:nation_code", async (c) => {
  const destination = await getDestinationByNationCode(c.get("supabase"), c.req.param("nation_code"));
  return c.json(destination);
});
