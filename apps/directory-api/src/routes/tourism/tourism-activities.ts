import { Hono } from "hono";
import { queryActivities, queryDiveSites, queryCulturalActivities, parseActivityFilters } from "../../services/tourismActivitiesService.js";
import type { AppBindings } from "../../types.js";

// VITE_FLAG_LIVE_RPC_ACTIVE=false (not applicable to this Worker route file,
// noted per CLAUDE.md hard rule).
//
// x402-gated in routeSchemas.ts — never call @x402 packages directly from
// here. Three distinct prices in this one file per the Phase B build
// brief: standard activities (Tier 2), dive sites (Tier 3), cultural
// activities (Tier 2).
export const TOURISM_ACTIVITIES_PRICE_USDC = 0.25;
export const TOURISM_DIVE_PRICE_USDC = 0.5;
export const TOURISM_CULTURAL_PRICE_USDC = 0.25;

// Rule 9 — NOAA reef coordinate join is approximate matching only, never
// exact equality. This hint is handed to consumers (agents) rather than
// performed server-side here, since no route in this file itself queries
// the coral bleaching endpoint.
const CORAL_BLEACHING_JOIN_HINT = {
  description:
    "Use reef_coordinate_lat and reef_coordinate_lng to query the PDC coral bleaching endpoint. Match within 0.025 degrees of the NOAA CoralTemp 0.05-degree grid.",
  pdcEndpoint: "/intelligence/coral-bleaching",
  matchPattern: "ABS(lat - reef_lat) < 0.025 AND ABS(lng - reef_lng) < 0.025",
};

export const tourismActivitiesRoute = new Hono<AppBindings>();

tourismActivitiesRoute.get("/tourism/dive/:nation_code", async (c) => {
  const results = await queryDiveSites(c.get("supabase"), c.req.param("nation_code"));
  return c.json({
    results,
    count: results.length,
    coral_bleaching_join_hint: CORAL_BLEACHING_JOIN_HINT,
  });
});

tourismActivitiesRoute.get("/tourism/cultural/:nation_code", async (c) => {
  const results = await queryCulturalActivities(c.get("supabase"), c.req.param("nation_code"));
  return c.json({ results, count: results.length });
});

tourismActivitiesRoute.get("/tourism/activities/:nation_code", async (c) => {
  const filters = parseActivityFilters({
    activity_type: c.req.query("activity_type"),
    skill_level: c.req.query("skill_level"),
    season: c.req.query("season"),
    max_price_usd: c.req.query("max_price_usd"),
    certification_required: c.req.query("certification_required"),
    accessible: c.req.query("accessible"),
    source_type: c.req.query("source_type"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });

  const { results, totalCount } = await queryActivities(c.get("supabase"), c.req.param("nation_code"), filters);

  return c.json({
    results,
    limit: filters.limit,
    offset: filters.offset,
    totalCount,
  });
});
