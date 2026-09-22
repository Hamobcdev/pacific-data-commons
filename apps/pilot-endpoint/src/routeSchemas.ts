import { declareDiscoveryExtension } from "@x402-avm/extensions";
import { TIER_PRICING } from "./lib/pricing.js";
import { DATASET_METADATA, FISHERIES_RECORDS } from "./data/fisheries.js";
import { LAW_BEFORE_CODE, CRYPTOGRAPHIC_CONTINUITY, INVISIBLE_INFRASTRUCTURE } from "./data/research.js";
import { PACIFIC_ADOPTION_METADATA } from "./data/pacificAdoption.js";

/**
 * Extracted from app.ts's createApp() (Session: pdc-pilot-endpoint Ajv/
 * Cloudflare Workers bazaar-validation fix) so the bazaar discovery schema
 * every paid route registers can be exercised directly in a Node test
 * (routeSchemas.test.ts calls ajv.compile() on each one) without booting the
 * whole app. Env-independent by construction — nothing here reads `env`, so
 * moving it out of createApp() changes nothing about runtime behaviour;
 * createApp() still builds identical PdcPaidRouteSpec entries from this
 * array, same as before.
 */
type DiscoveryConfig = Parameters<typeof declareDiscoveryExtension>[0] & { method: "GET" | "POST" | "HEAD" | "DELETE" | "PUT" | "PATCH" };
export function discoveryFor(config: DiscoveryConfig) {
  return declareDiscoveryExtension(config).bazaar;
}

export const paidRoutes: Array<{
  method: "GET" | "POST";
  path: string;
  tier: keyof typeof TIER_PRICING;
  description: string;
  discovery: ReturnType<typeof discoveryFor>;
  /** Only set where it differs from DATASET_METADATA.category (the 3
   * Session 21 routes below) — the x402 route metadata's own category tag
   * must match the actual dataset a route serves, same reasoning as
   * ROUTE_DATASET (app.ts) for transactions_log attribution. */
  category?: string;
}> = [
  {
    method: "GET",
    path: "/summary",
    tier: "summary",
    description: `Key findings summary for ${DATASET_METADATA.title}. Returns stock status by species, coverage statistics, and 3 key findings. SYNTHETIC DEMO DATA.`,
    discovery: discoveryFor({
      method: "GET",
      output: {
        example: {
          schema_version: "pdp-1.0",
          paid_tier: "summary",
          data: {
            total_records: FISHERIES_RECORDS.length,
            species_covered: ["skipjack", "yellowfin", "bigeye"],
            zones_covered: ["samoa_eez", "tonga_eez"],
            stock_status: [{ species: "skipjack", latest_year: 2023, stock_index: 0.92, status: "healthy" }],
            key_findings: ["Skipjack remains the dominant species with stock index 0.92 in 2023"],
          },
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/slice",
    tier: "slice",
    description:
      "Filtered tuna data slice. Query params: species (skipjack|yellowfin|bigeye), year_start, year_end, zone (samoa_eez|tonga_eez). SYNTHETIC DEMO DATA.",
    discovery: discoveryFor({
      method: "GET",
      input: { species: "skipjack", year_start: 2020, year_end: 2023, zone: "samoa_eez" },
      inputSchema: {
        properties: {
          species: { type: "string", enum: ["skipjack", "yellowfin", "bigeye"] },
          year_start: { type: "integer", description: `>= ${DATASET_METADATA.time_period_start}` },
          year_end: { type: "integer", description: `<= ${DATASET_METADATA.time_period_end}` },
          zone: { type: "string", enum: ["samoa_eez", "tonga_eez"] },
        },
        required: [],
      },
      output: {
        example: {
          schema_version: "pdp-1.0",
          paid_tier: "slice",
          data: [{ species: "skipjack", zone: "samoa_eez", year: 2023, stock_index: 0.92 }],
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/full",
    tier: "full",
    description: "Complete synthetic tuna dataset — all 18 records, all species, all years, both zones. SYNTHETIC DEMO DATA.",
    discovery: discoveryFor({
      method: "GET",
      output: {
        example: { schema_version: "pdp-1.0", paid_tier: "full", data: [{ species: "skipjack", zone: "samoa_eez", year: 2023, stock_index: 0.92 }] },
      },
    }),
  },
  {
    method: "GET",
    path: "/expert",
    tier: "expert",
    description: "Full dataset plus methodology notes, stock assessment interpretation, and citation-ready format. SYNTHETIC DEMO DATA.",
    discovery: discoveryFor({
      method: "GET",
      output: {
        example: {
          schema_version: "pdp-1.0",
          paid_tier: "expert",
          data: [{ species: "skipjack", zone: "samoa_eez", year: 2023, stock_index: 0.92 }],
          expert_annotations: { stock_assessment_method: "Virtual Population Analysis (VPA) — synthetic demonstration" },
        },
      },
    }),
  },
  {
    method: "POST",
    path: "/commission",
    tier: "commission",
    description: "Custom commissioned query. POC: payment confirms your commission request. SBP will contact you within 48 hours to discuss scope.",
    discovery: discoveryFor({
      method: "POST",
      bodyType: "json",
      input: { analysis_request: "Describe the custom Pacific fisheries analysis you need" },
      inputSchema: {
        properties: {
          analysis_request: {
            type: "string",
            description:
              "Free-text description of the analysis you're commissioning. POC: not parsed by the handler — recorded via your payment, SBP follows up by email.",
          },
        },
        required: [],
      },
      output: {
        example: {
          commission_confirmed: true,
          message: "Your commission payment has been received. SBP will contact you within 48 hours.",
          contact: "contact@synergybp.com",
        },
      },
    }),
  },
  // Session 21 (Deliverable 1) — PDC-POL-2026-001 Decision 42: research
  // endpoints price at Tier 1 (summary) maximum; the underlying working
  // paper stays openly accessible on request.
  {
    method: "GET",
    path: "/research/law-before-code",
    tier: "summary",
    category: "governance",
    description: `Structured metadata for "${LAW_BEFORE_CODE.title}" — abstract, policy gaps identified, governance frameworks referenced, citation.`,
    discovery: discoveryFor({
      method: "GET",
      output: { example: { title: LAW_BEFORE_CODE.title, version: LAW_BEFORE_CODE.version, abstract: LAW_BEFORE_CODE.abstract } },
    }),
  },
  {
    method: "GET",
    path: "/research/cryptographic-continuity",
    tier: "summary",
    category: "governance",
    description: `Structured metadata for "${CRYPTOGRAPHIC_CONTINUITY.title}" — abstract, incidents analysed, mandate components, citation.`,
    discovery: discoveryFor({
      method: "GET",
      output: { example: { title: CRYPTOGRAPHIC_CONTINUITY.title, version: CRYPTOGRAPHIC_CONTINUITY.version, abstract: CRYPTOGRAPHIC_CONTINUITY.abstract } },
    }),
  },
  // Session 23 — third working paper (Decision 42, same Tier 1 cap).
  // ?tier=summary|slice|full supported on all three research routes; see
  // resolveResearchTier's doc comment for why depth doesn't change price.
  {
    method: "GET",
    path: "/research/invisible-infrastructure",
    tier: "summary",
    category: "governance",
    description: `Structured metadata for "${INVISIBLE_INFRASTRUCTURE.title}" — key arguments, fraudulent schemes documented, standards built on DLT, policy gaps, recommendations, citation. Supports ?tier=summary|slice|full.`,
    discovery: discoveryFor({
      method: "GET",
      output: { example: { title: INVISIBLE_INFRASTRUCTURE.title, version: INVISIBLE_INFRASTRUCTURE.version, abstract: INVISIBLE_INFRASTRUCTURE.abstract } },
    }),
  },
  // Session 21 (Deliverable 2)
  {
    method: "GET",
    path: "/pacific/blockchain-adoption",
    tier: "summary",
    category: "governance",
    description: `${PACIFIC_ADOPTION_METADATA.dataset} — ${PACIFIC_ADOPTION_METADATA.coverage}, structured and queryable.`,
    discovery: discoveryFor({
      method: "GET",
      output: { example: { dataset: PACIFIC_ADOPTION_METADATA.dataset, version: PACIFIC_ADOPTION_METADATA.version, nations: [{ country: "Samoa", iso: "WS", regulatory_sandbox: true }] } },
    }),
  },
];
