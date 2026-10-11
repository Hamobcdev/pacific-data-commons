import { Hono } from "hono";
import { queryPacificBrief } from "../../services/pacificIntelligenceService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in index.ts (priceUsdc registered separately from this
// handler — same posture as fxRoute, walletBalanceRoute, search.ts).
//
// Param validation, config checks, and sub-endpoint-failure error mapping
// live in services/pacificIntelligenceService.ts's queryPacificBrief() so
// the Agent Dataset Gateway's query adapter can reuse it.
export const pacificBriefRoute = new Hono<AppBindings>();

pacificBriefRoute.get("/intelligence/pacific-brief", async (c) => {
  const brief = await queryPacificBrief({ topic: c.req.query("topic"), country: c.req.query("country") }, c.get("env"), c.get("supabase"));
  return c.json(brief);
});
