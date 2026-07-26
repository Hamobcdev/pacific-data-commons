import { Hono } from "hono";
import { TIER_PRICING } from "../../lib/pricing.js";
import type { AppBindings } from "../../types.js";

export const schemaRoute = new Hono<AppBindings>();

/** Pacific Data Protocol v1.0 schema for this endpoint's fisheries category —
 * lets an agent understand the response shape and pricing before paying. */
schemaRoute.get("/schema", (c) => {
  return c.json({
    schema_version: "pdp-1.0",
    category: "fisheries",
    sub_category: "tuna_stock_assessment",
    record_schema: {
      year: "integer — year of assessment",
      species: "enum: skipjack | yellowfin | bigeye",
      catch_volume_mt: "number — catch volume in metric tonnes",
      stock_index: "number 0-1 — relative stock abundance index",
      vessel_type: "enum: purse_seine | longline | pole_and_line",
      zone: "enum: samoa_eez | tonga_eez",
      confidence_level: "string — data quality indicator",
    },
    query_parameters: {
      species: "optional — filter by species",
      year_start: "optional integer — filter from year (inclusive)",
      year_end: "optional integer — filter to year (inclusive)",
      zone: "optional — filter by EEZ zone",
    },
    pricing: {
      summary: { price_usdc: TIER_PRICING.summary, returns: "SummaryData — key findings only" },
      slice: { price_usdc: TIER_PRICING.slice, returns: "FisheriesRecord[] — filtered by query params" },
      full: { price_usdc: TIER_PRICING.full, returns: "FisheriesRecord[] — all 18 records" },
      expert: { price_usdc: TIER_PRICING.expert, returns: "FisheriesRecord[] + annotations" },
      commission: { price_usdc: TIER_PRICING.commission, returns: "Commission confirmation — manual POC" },
    },
  });
});
