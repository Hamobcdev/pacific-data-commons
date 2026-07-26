import { Hono } from "hono";
import { DATASET_METADATA } from "../../data/fisheries.js";
import { TIER_PRICING } from "../../lib/pricing.js";
import type { AppBindings } from "../../types.js";

export const commissionRoute = new Hono<AppBindings>();

/** Tier 5 is manual during POC (CLAUDE.md Decision 14) — payment confirms
 * the commission request; SBP follows up by email to scope the actual work. */
commissionRoute.post("/commission", (c) => {
  return c.json({
    schema_version: "pdp-1.0",
    data_warning: DATASET_METADATA.data_warning,
    commission_confirmed: true,
    message:
      "Your commission payment has been received. SBP will contact you within 48 hours to discuss the scope of your custom query. This is a platform demonstration — commissioned queries during the POC period are handled manually.",
    next_steps: [
      "SBP will email you within 48 hours",
      "Please email contact@synergybp.com with your analysis requirements",
      "Reference your payment transaction ID in the email",
    ],
    contact: "contact@synergybp.com",
    paid_tier: "commission",
    amount_paid_usdc: TIER_PRICING.commission,
    accessed_at: new Date().toISOString(),
  });
});
