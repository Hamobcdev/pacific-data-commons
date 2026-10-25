import { Hono } from "hono";
import { getWeddingInfo } from "../../services/tourismWeddingsService.js";
import type { AppBindings } from "../../types.js";

// VITE_FLAG_LIVE_RPC_ACTIVE=false (not applicable to this Worker route file,
// noted per CLAUDE.md hard rule).
//
// x402-gated in routeSchemas.ts — never call @x402 packages directly from
// here. Tier 2 per the Phase B build brief.
export const TOURISM_WEDDINGS_PRICE_USDC = 0.25;

export const tourismWeddingsRoute = new Hono<AppBindings>();

tourismWeddingsRoute.get("/tourism/weddings/:nation_code", async (c) => {
  const nationCode = c.req.param("nation_code");
  const info = await getWeddingInfo(c.get("supabase"), nationCode);

  return c.json({
    success: true,
    data: {
      wedding_requirements: info.wedding_requirements,
      wedding_venues: info.wedding_venues,
      legal_data_warning: info.legal_data_warning,
      ...(info.wedding_data_status ? { wedding_data_status: info.wedding_data_status } : {}),
    },
    meta: {
      endpoint: "/tourism/weddings/{nation_code}",
      nation_code: nationCode,
      price_usdc: TOURISM_WEDDINGS_PRICE_USDC,
      data_confidence: info.wedding_requirements?.data_confidence ?? null,
      last_verified: info.wedding_requirements?.last_verified ?? null,
      timestamp: new Date().toISOString(),
    },
  });
});
