import { Hono } from "hono";
import { queryTransport, queryTransportRoutes } from "../../services/tourismTransportService.js";
import type { AppBindings } from "../../types.js";

// VITE_FLAG_LIVE_RPC_ACTIVE=false (not applicable to this Worker route file,
// noted per CLAUDE.md hard rule).
//
// x402-gated in routeSchemas.ts — never call @x402 packages directly from
// here. Tier 1 per the Phase B build brief.
export const TOURISM_TRANSPORT_PRICE_USDC = 0.1;

export const tourismTransportRoute = new Hono<AppBindings>();

// Static "/routes" path registered before the dynamic ":nation_code" param
// route — Hono's router already resolves this correctly regardless of
// order (static segments win over param segments at the same depth), but
// the ordering here keeps intent readable.
tourismTransportRoute.get("/tourism/transport/routes", async (c) => {
  const results = await queryTransportRoutes(c.get("supabase"), {
    origin: c.req.query("origin"),
    destination: c.req.query("destination"),
  });

  return c.json({ results, count: results.length });
});

tourismTransportRoute.get("/tourism/transport/:nation_code", async (c) => {
  const results = await queryTransport(c.get("supabase"), c.req.param("nation_code"), {
    transportType: c.req.query("transport_type"),
    frequency: c.req.query("frequency"),
  });

  return c.json({ results, count: results.length });
});
