import { Hono } from "hono";
import { DATASET_METADATA, FISHERIES_RECORDS } from "../../data/fisheries.js";
import { buildPDPResponse, type ExpertAnnotations } from "../../lib/response.js";
import { TIER_PRICING } from "../../lib/pricing.js";
import type { AppBindings } from "../../types.js";

export const expertRoute = new Hono<AppBindings>();

const EXPERT_ANNOTATIONS: ExpertAnnotations = {
  stock_assessment_method: "Virtual Population Analysis (VPA) — synthetic demonstration",
  confidence_intervals: {
    skipjack: { lower: 0.85, upper: 0.99, note: "Synthetic — not real confidence bounds" },
    yellowfin: { lower: 0.68, upper: 0.88, note: "Synthetic — not real confidence bounds" },
    bigeye: { lower: 0.53, upper: 0.67, note: "Synthetic — not real confidence bounds" },
  },
  recommended_citation: DATASET_METADATA.citation,
  data_limitations: [
    "All values are synthetic and do not represent real stock assessments",
    "Confidence intervals are illustrative only",
    "This dataset exists to demonstrate PDC payment infrastructure",
  ],
  pdp_compliance: "This response conforms to Pacific Data Protocol v1.0 fisheries schema",
};

expertRoute.get("/expert", (c) => {
  const envelope = buildPDPResponse({
    tier: "expert",
    amountPaidUsdc: TIER_PRICING.expert,
    data: FISHERIES_RECORDS,
    queryReceived: {},
    queryApplied: {},
    datasetHash: c.get("datasetHash"),
    publicUrl: c.get("env").PUBLIC_URL,
  });

  return c.json({ ...envelope, expert_annotations: EXPERT_ANNOTATIONS });
});
