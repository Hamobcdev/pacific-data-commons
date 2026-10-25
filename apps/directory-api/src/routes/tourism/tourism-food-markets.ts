import { Hono } from "hono";
import { queryFoodBeverage, queryMarkets, parseFoodFilters } from "../../services/tourismFoodMarketsService.js";
import type { AppBindings } from "../../types.js";

// VITE_FLAG_LIVE_RPC_ACTIVE=false (not applicable to this Worker route file,
// noted per CLAUDE.md hard rule).
//
// x402-gated in routeSchemas.ts — never call @x402 packages directly from
// here. Tier 2 per the Phase B build brief.
export const TOURISM_FOOD_MARKETS_PRICE_USDC = 0.25;

export const tourismFoodMarketsRoute = new Hono<AppBindings>();

tourismFoodMarketsRoute.get("/tourism/food/:nation_code", async (c) => {
  const filters = parseFoodFilters({
    venue_type: c.req.query("venue_type"),
    cuisine_type: c.req.query("cuisine_type"),
    dietary: c.req.query("dietary"),
    dining_tier: c.req.query("dining_tier"),
    kava_available: c.req.query("kava_available"),
    max_price_per_person: c.req.query("max_price_per_person"),
    source_type: c.req.query("source_type"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });

  const { results, totalCount } = await queryFoodBeverage(c.get("supabase"), c.req.param("nation_code"), filters);

  return c.json({
    results,
    limit: filters.limit,
    offset: filters.offset,
    totalCount,
  });
});

tourismFoodMarketsRoute.get("/tourism/markets/:nation_code", async (c) => {
  const results = await queryMarkets(c.get("supabase"), c.req.param("nation_code"), {
    marketType: c.req.query("market_type"),
    day: c.req.query("day"),
  });

  return c.json({ results, count: results.length });
});
