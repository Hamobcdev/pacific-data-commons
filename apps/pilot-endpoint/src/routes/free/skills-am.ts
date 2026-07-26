import { Hono } from "hono";
import { DATASET_METADATA } from "../../data/fisheries.js";
import { TIER_PRICING } from "../../lib/pricing.js";
import type { AppBindings } from "../../types.js";

export const skillsAgentmarketRoute = new Hono<AppBindings>();

/** Agent.market-format skills file (CLAUDE.md Decision 15: both Agent.market
 * and PDP formats generated per endpoint). */
skillsAgentmarketRoute.get("/skills-agentmarket.json", (c) => {
  const baseUrl = c.get("env").PUBLIC_URL;

  return c.json({
    name: "Pacific Tuna Stock Assessment — PDC Demo",
    description:
      "Synthetic Pacific fisheries demonstration. PDC platform proof of concept. Tuna catch volumes and stock indices for Samoa and Tonga EEZs 2018-2023. DEMO DATA ONLY — not for research or commercial decisions.",
    version: "1.0",
    provider: DATASET_METADATA.institution,
    country: DATASET_METADATA.country,
    schema: "pdp-1.0",
    category: "fisheries",
    competition_tag: DATASET_METADATA.competition_tag,
    payment_network: "algorand:mainnet",
    base_url: baseUrl,
    endpoints: [
      {
        path: "/summary",
        method: "GET",
        description: "Key findings summary — stock status by species",
        price_usdc: TIER_PRICING.summary,
        payment: "x402",
        response_time_sla: "< 500ms",
      },
      {
        path: "/slice",
        method: "GET",
        description: "Filtered data slice by species, year range, or EEZ zone",
        price_usdc: TIER_PRICING.slice,
        payment: "x402",
        parameters: {
          species: "optional string (skipjack|yellowfin|bigeye)",
          year_start: "optional integer (2018-2023)",
          year_end: "optional integer (2018-2023)",
          zone: "optional string (samoa_eez|tonga_eez)",
        },
      },
      {
        path: "/full",
        method: "GET",
        description: "Complete dataset — all records",
        price_usdc: TIER_PRICING.full,
        payment: "x402",
      },
      {
        path: "/expert",
        method: "GET",
        description: "Full dataset plus methodology and citation format",
        price_usdc: TIER_PRICING.expert,
        payment: "x402",
      },
      {
        path: "/commission",
        method: "POST",
        description: "Custom commissioned query — manual POC fulfilment",
        price_usdc: TIER_PRICING.commission,
        payment: "x402",
      },
    ],
    free_routes: [
      { path: "/health", description: "Server and dataset status" },
      { path: "/schema", description: "PDP v1.0 schema definition" },
      { path: "/integrity", description: "Current dataset canonical hash" },
      { path: "/provenance", description: "Provenance certificate reference" },
      { path: "/skills-agentmarket.json", description: "This file" },
      { path: "/skills-pdp.json", description: "PDP format skills file" },
    ],
    rating_instructions:
      "After purchase, submit a wallet-signed rating to the PDC rating API. Rating API endpoint will be published in Session 6.",
    data_warning: "SYNTHETIC DATA — demonstration only",
  });
});
