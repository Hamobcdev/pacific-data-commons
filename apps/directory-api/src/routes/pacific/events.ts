import { Hono } from "hono";
import { queryEvents } from "../../services/pacificEventsService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in index.ts (priceUsdc registered separately from this
// handler — same posture as fxRoute, walletBalanceRoute, pacificBriefRoute).
//
// Query params:
//   country (optional)    — ISO 3166-1 alpha-2: WS, FJ, TO, PG, SB, VU, CK
//   days_ahead (optional) — integer 1-365, default 90
//   category (optional)   — festival/concert/sport/cultural/religious/political/business/other
//
// Validation + lookup lives in services/pacificEventsService.ts's
// queryEvents() so the Agent Dataset Gateway's query adapter can reuse it.
export const pacificEventsRoute = new Hono<AppBindings>();

pacificEventsRoute.get("/pacific/events", async (c) => {
  const result = await queryEvents(
    {
      country: c.req.query("country"),
      daysAhead: c.req.query("days_ahead"),
      category: c.req.query("category"),
    },
    c.get("supabase"),
  );

  return c.json(result);
});
