import { Hono } from "hono";
import { queryPacificTravelBrief } from "../../services/pacificTourismService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in index.ts (priceUsdc registered separately from this
// handler — same posture as pacificBriefRoute, fxRoute, walletBalanceRoute).
//
// Param validation, config checks, and sub-endpoint-failure error mapping
// live in services/pacificTourismService.ts's queryPacificTravelBrief() so
// the Agent Dataset Gateway's query adapter can reuse it.
export const pacificTravelRoute = new Hono<AppBindings>();

// Exported for reuse by routes/internal.ts's POST /internal/tourism-demo
// (Session 33) — same destination/window validation set as
// queryPacificTravelBrief() uses internally, no x402 gate.
export const VALID_DESTINATIONS = new Set(["WS", "FJ", "TO", "PG", "SB", "VU", "CK"]);
export const VALID_TRAVEL_WINDOWS = new Set(["next_30_days", "next_90_days", "christmas_2026", "school_holidays"]);

pacificTravelRoute.get("/intelligence/pacific-travel", async (c) => {
  const brief = await queryPacificTravelBrief({ destination: c.req.query("destination"), travelWindow: c.req.query("travel_window") }, c.get("env"), c.get("supabase"));
  return c.json(brief);
});
