import { Hono } from "hono";
import { searchTourism, parseSearchFilters } from "../../services/tourismSearchService.js";
import type { AppBindings } from "../../types.js";

// VITE_FLAG_LIVE_RPC_ACTIVE=false (not applicable to this Worker route file,
// noted per CLAUDE.md hard rule).
//
// x402-gated in routeSchemas.ts — never call @x402 packages directly from
// here. Premium tier: highest-value endpoint, joins across multiple
// tables in one call, per the Phase B build brief.
export const TOURISM_SEARCH_PRICE_USDC = 1.0;

export const tourismSearchRoute = new Hono<AppBindings>();

tourismSearchRoute.get("/tourism/search", async (c) => {
  const searchParams = new URL(c.req.url).searchParams;
  const filters = parseSearchFilters(searchParams);

  const result = await searchTourism(c.get("supabase"), filters);

  return c.json({
    query: Object.fromEntries(searchParams.entries()),
    nations_matched: result.nations_matched,
    results: result.results,
    data_confidence_summary: result.data_confidence_summary,
    source_type_summary: result.source_type_summary,
  });
});
