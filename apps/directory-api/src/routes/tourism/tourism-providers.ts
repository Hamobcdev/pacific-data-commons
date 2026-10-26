import { Hono } from "hono";
import { queryProviders, parseProviderFilters } from "../../services/tourismProvidersService.js";
import type { AppBindings } from "../../types.js";

// VITE_FLAG_LIVE_RPC_ACTIVE=false (not applicable to this Worker route file,
// noted per CLAUDE.md hard rule).
//
// x402-gated in routeSchemas.ts — never call @x402 packages directly from
// here. Tier 1 per the Phase B build brief.
export const TOURISM_PROVIDERS_PRICE_USDC = 0.1;

export const tourismProvidersRoute = new Hono<AppBindings>();

tourismProvidersRoute.get("/tourism/providers/:nation_code", async (c) => {
  const filters = parseProviderFilters({
    provider_category: c.req.query("provider_category"),
    verification_status: c.req.query("verification_status"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });

  const { results, totalCount } = await queryProviders(c.get("supabase"), c.req.param("nation_code"), filters);

  return c.json({
    results,
    limit: filters.limit,
    offset: filters.offset,
    totalCount,
  });
});
