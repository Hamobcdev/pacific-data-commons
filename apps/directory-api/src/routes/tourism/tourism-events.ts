import { Hono } from "hono";
import { queryTourismEvents, queryChristmasEvents, parseEventFilters } from "../../services/tourismEventsService.js";
import type { AppBindings } from "../../types.js";

// VITE_FLAG_LIVE_RPC_ACTIVE=false (not applicable to this Worker route file,
// noted per CLAUDE.md hard rule).
//
// x402-gated in routeSchemas.ts — never call @x402 packages directly from
// here. Standard events lookup is Tier 1; the seasonal Christmas endpoint
// is priced higher for high Q4 agent demand, per the Phase B build brief.
export const TOURISM_EVENTS_PRICE_USDC = 0.1;
export const TOURISM_EVENTS_CHRISTMAS_PRICE_USDC = 0.25;

export const tourismEventsRoute = new Hono<AppBindings>();

// Static "/pacific/christmas" path registered before the dynamic
// ":nation_code" param route — see tourism-transport.ts's identical note.
tourismEventsRoute.get("/tourism/events/pacific/christmas", async (c) => {
  const groups = await queryChristmasEvents(c.get("supabase"));
  return c.json({ groups, nation_count: groups.length });
});

tourismEventsRoute.get("/tourism/events/:nation_code", async (c) => {
  const filters = parseEventFilters({
    event_category: c.req.query("event_category"),
    from_date: c.req.query("from_date"),
    to_date: c.req.query("to_date"),
    is_tourist_friendly: c.req.query("is_tourist_friendly"),
  });

  const results = await queryTourismEvents(c.get("supabase"), c.req.param("nation_code"), filters);

  return c.json({ results, count: results.length });
});
