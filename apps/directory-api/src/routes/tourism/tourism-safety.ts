import { Hono } from "hono";
import { queryHazards, queryHealthInfrastructure, getCulturalProtocols, SAFETY_DATA_WARNING } from "../../services/tourismSafetyService.js";
import type { AppBindings } from "../../types.js";

// VITE_FLAG_LIVE_RPC_ACTIVE=false (not applicable to this Worker route file,
// noted per CLAUDE.md hard rule).
//
// x402-gated in routeSchemas.ts — never call @x402 packages directly from
// here. All three routes in this file are Tier 3 per the Phase B build brief.
export const TOURISM_SAFETY_PRICE_USDC = 0.5;
export const TOURISM_PROTOCOLS_PRICE_USDC = 0.5;

export const tourismSafetyRoute = new Hono<AppBindings>();

tourismSafetyRoute.get("/tourism/hazards/:nation_code", async (c) => {
  const results = await queryHazards(c.get("supabase"), c.req.param("nation_code"), {
    hazardType: c.req.query("hazard_type"),
    riskLevel: c.req.query("risk_level"),
    island: c.req.query("island"),
  });

  return c.json({
    results,
    count: results.length,
    safety_data_warning: SAFETY_DATA_WARNING,
  });
});

tourismSafetyRoute.get("/tourism/health/:nation_code", async (c) => {
  const results = await queryHealthInfrastructure(c.get("supabase"), c.req.param("nation_code"), {
    facilityType: c.req.query("facility_type"),
    hasSurgicalCapacity: c.req.query("has_surgical_capacity"),
    hasEvacuationCapability: c.req.query("has_evacuation_capability"),
  });

  return c.json({
    results,
    count: results.length,
    safety_data_warning: SAFETY_DATA_WARNING,
  });
});

tourismSafetyRoute.get("/tourism/protocols/:nation_code", async (c) => {
  const protocol = await getCulturalProtocols(c.get("supabase"), c.req.param("nation_code"));
  return c.json(protocol);
});
