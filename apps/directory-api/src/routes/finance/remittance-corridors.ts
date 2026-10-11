import { Hono } from "hono";
import { queryRemittanceCorridors } from "../../services/pacificRemittanceService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 1 / $0.01 — quarterly source data,
// lightweight fetch). See services/pacificRemittanceService.ts for the
// full sourcing doc comment, including why traditional_rails is null for
// every corridor this session (World Bank's RPW API is entirely
// Cloudflare-blocked for server-side requests, confirmed live).
//
// Query params (all optional):
//   corridor — one corridor id, e.g. ?corridor=AUS_WST. 400 if unknown.
//   min_saving_pct — only corridors where potential_saving_pct exceeds
//     this. A corridor with potential_saving_pct: null (traditional_rails
//     unavailable — true for every corridor this session) never passes
//     any threshold > 0, since "exceeds an unknown value" can't be
//     asserted true.
//   token — one crypto token (XRP/XLM/ALGO). Filters crypto_rails down to
//     just that token on every returned corridor. 400 if unknown.
//
// Validation + filtering live in pacificRemittanceService.ts's
// queryRemittanceCorridors() so the Agent Dataset Gateway's query
// adapter can reuse it.
export const pacificRemittanceRoute = new Hono<AppBindings>();

pacificRemittanceRoute.get("/finance/remittance-corridors", async (c) => {
  const result = await queryRemittanceCorridors({
    corridor: c.req.query("corridor"),
    token: c.req.query("token"),
    minSavingPct: c.req.query("min_saving_pct"),
  });

  c.header("Cache-Control", "public, max-age=86400");
  return c.json(result);
});
