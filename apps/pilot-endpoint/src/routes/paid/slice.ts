import { Hono } from "hono";
import { applySliceFilters } from "../../lib/sliceFilter.js";
import { buildPDPResponse } from "../../lib/response.js";
import { TIER_PRICING } from "../../lib/pricing.js";
import type { AppBindings } from "../../types.js";

export const sliceRoute = new Hono<AppBindings>();

sliceRoute.get("/slice", (c) => {
  const raw = c.req.query();
  // Thrown before any data leaves this handler if invalid — @pdc/x402-adapter
  // cancels the verified-but-unsettled payment when a handler throws, so an
  // invalid query never actually charges the buyer.
  const { filtered, applied } = applySliceFilters(raw);

  return c.json(
    buildPDPResponse({
      tier: "slice",
      amountPaidUsdc: TIER_PRICING.slice,
      data: filtered,
      queryReceived: raw,
      queryApplied: applied,
      datasetHash: c.get("datasetHash"),
      publicUrl: c.get("env").PUBLIC_URL,
    }),
  );
});
