import { Hono } from "hono";
import { FISHERIES_RECORDS } from "../../data/fisheries.js";
import { buildPDPResponse } from "../../lib/response.js";
import { TIER_PRICING } from "../../lib/pricing.js";
import type { AppBindings } from "../../types.js";

export const fullRoute = new Hono<AppBindings>();

fullRoute.get("/full", (c) => {
  return c.json(
    buildPDPResponse({
      tier: "full",
      amountPaidUsdc: TIER_PRICING.full,
      data: FISHERIES_RECORDS,
      queryReceived: {},
      queryApplied: {},
      datasetHash: c.get("datasetHash"),
      publicUrl: c.get("env").PUBLIC_URL,
    }),
  );
});
