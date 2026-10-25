import { Hono } from "hono";
import { queryAccommodations, queryAccommodationConferences, parseAccommodationFilters } from "../../services/tourismAccommodationService.js";
import type { AppBindings } from "../../types.js";

// VITE_FLAG_LIVE_RPC_ACTIVE=false (not applicable to this Worker route file,
// noted per CLAUDE.md hard rule).
//
// x402-gated in routeSchemas.ts — never call @x402 packages directly from
// here. Tier 2 per the Phase B build brief.
export const TOURISM_ACCOMMODATION_PRICE_USDC = 0.25;

export const tourismAccommodationRoute = new Hono<AppBindings>();

tourismAccommodationRoute.get("/tourism/accommodation/:nation_code/conferences", async (c) => {
  const results = await queryAccommodationConferences(c.get("supabase"), c.req.param("nation_code"));
  return c.json({ results, count: results.length });
});

tourismAccommodationRoute.get("/tourism/accommodation/:nation_code", async (c) => {
  const filters = parseAccommodationFilters({
    property_type: c.req.query("property_type"),
    max_price_usd: c.req.query("max_price_usd"),
    min_price_usd: c.req.query("min_price_usd"),
    has_pool: c.req.query("has_pool"),
    has_spa: c.req.query("has_spa"),
    has_conference: c.req.query("has_conference"),
    has_casino: c.req.query("has_casino"),
    has_wedding_venue: c.req.query("has_wedding_venue"),
    star_rating_min: c.req.query("star_rating_min"),
    source_type: c.req.query("source_type"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });

  const { results, totalCount } = await queryAccommodations(c.get("supabase"), c.req.param("nation_code"), filters);

  return c.json({
    results,
    limit: filters.limit,
    offset: filters.offset,
    totalCount,
  });
});
