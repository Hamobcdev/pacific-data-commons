import { Hono } from "hono";
import { checkFacilitatorHealth } from "@pdc/x402-adapter";
import { DATASET_METADATA, FISHERIES_RECORDS } from "../../data/fisheries.js";
import { formatUsdc, TIER_PRICING } from "../../lib/pricing.js";
import type { AppBindings } from "../../types.js";

export const healthRoute = new Hono<AppBindings>();

const PRICING = {
  summary: formatUsdc(TIER_PRICING.summary),
  slice: formatUsdc(TIER_PRICING.slice),
  full: formatUsdc(TIER_PRICING.full),
  expert: formatUsdc(TIER_PRICING.expert),
  commission: formatUsdc(TIER_PRICING.commission),
} as const;

healthRoute.get("/health", async (c) => {
  const env = c.get("env");
  // Checked live, not just at startup — a stale "healthy" from boot would
  // keep lying after GoPlausible goes down (R4: graceful degradation, not
  // graceful amnesia).
  const facilitatorHealthy = await checkFacilitatorHealth(env.FACILITATOR_URL);

  // HTTP status is always 200 here, even when degraded: this route doubles
  // as Railway's deploy healthcheck (railway.json), and a GoPlausible blip
  // must not read as "the server is down" and trigger a container restart —
  // free routes keep serving fine regardless of facilitator state. Actual
  // health monitoring (CLAUDE.md Section 6: endpoint health checker cron)
  // reads `facilitator_healthy` from the body, not the HTTP status.
  return c.json({
    status: facilitatorHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    dataset: {
      title: DATASET_METADATA.title,
      records: FISHERIES_RECORDS.length,
      canonical_hash: c.get("datasetHash"),
      category: DATASET_METADATA.category,
      competition_tag: DATASET_METADATA.competition_tag,
    },
    pricing: PRICING,
    network: `algorand-${env.ALGORAND_NETWORK}`,
    facilitator: env.FACILITATOR_URL,
    facilitator_healthy: facilitatorHealthy,
  });
});
