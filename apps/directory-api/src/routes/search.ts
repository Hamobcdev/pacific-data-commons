import { Hono } from "hono";
import { parseSearchFilters, searchEndpoints } from "../services/searchService.js";
import type { AppBindings } from "../types.js";

export const searchRoute = new Hono<AppBindings>();

searchRoute.get("/search", async (c) => {
  const supabase = c.get("supabase");
  const filters = parseSearchFilters(new URL(c.req.url).searchParams);
  const result = await searchEndpoints(supabase, filters);

  return c.json({
    results: result.results,
    page: result.page,
    limit: result.limit,
    totalCount: result.totalCount,
    // Echoed back so the settlement listener can log what was actually
    // searched for (transactions_log.query_parameters) — settlement happens
    // after this handler returns, with only this response body to read from.
    filters,
  });
});
