import { describe, expect, it } from "vitest";
import { toPublicEndpoint, toPublicProvider } from "../services/publicProjections.js";
import type { EndpointRow, ProviderRow } from "../lib/dbTypes.js";

const providerRow: ProviderRow = {
  id: "prov-1",
  institution_name: "University of the South Pacific",
  institution_type: "university",
  provider_track: "international",
  country: "Fiji",
  verified_domain: "usp.ac.fj",
  wallet_address: "AAAAUSPADDRESS",
  usdc_opted_in: true,
  trust_tier: "silver",
  verified_government: false,
  is_active: true,
  went_live_at: "2026-01-01T00:00:00.000Z",
  total_queries_served: 42,
  last_query_at: null,
  created_at: "2025-12-01T00:00:00.000Z",
};

const endpointRow: EndpointRow = {
  id: "end-1",
  provider_id: "prov-1",
  endpoint_url: "https://usp-fisheries.example/api",
  health_check_url: "https://usp-fisheries.example/api/health",
  integrity_url: "https://usp-fisheries.example/api/integrity",
  data_category: "fisheries",
  data_sub_category: "tuna-stock",
  title: "Pacific Tuna Stock Assessment",
  description: "Annual tuna stock assessment for the Fiji EEZ",
  geography_country: ["Fiji"],
  geography_region: "Pacific",
  time_period_start: 2010,
  time_period_end: 2024,
  update_frequency: "annual",
  spatial_resolution: null,
  data_format: "pdp-1.0",
  languages: ["English"],
  sample_size: null,
  commercial_eligibility: null,
  sensitivity_level: null,
  pricing_tiers: [{ tier: 1, name: "Summary", price_usdc: 0.01, path: "/summary" }],
  max_tier_at_bronze: 2,
  sample_response: { note: "sample" },
  query_parameters: null,
  rate_limit: "100 per hour",
  response_time_sla: "2s",
  indigenous_data_flag: false,
  cultural_sensitivity: "none",
  sovereignty_framework: null,
  permitted_use_cases: ["commercial", "research"],
  attribution_required: true,
  attribution_format: "Cite USP Fisheries",
  commercial_licence_req: false,
  donor_conditions: null,
  competition_tag: "x402-global-challenge",
  bazaar_registered: true,
  skills_file_url: "https://usp-fisheries.example/skills.json",
  health_status: "healthy",
  last_health_check_at: null,
  total_queries: 10,
  total_revenue_usdc: 1.2,
  last_queried_at: null,
  is_active: true,
  paused_reason: null,
  paused_at: null,
  created_at: "2025-12-01T00:00:00.000Z",
};

describe("toPublicProvider", () => {
  it("omits internal/financial fields and maps public ones", () => {
    const result = toPublicProvider(providerRow);
    expect(result).toEqual({
      id: "prov-1",
      institutionName: "University of the South Pacific",
      institutionType: "university",
      country: "Fiji",
      verifiedDomain: "usp.ac.fj",
      walletAddress: "AAAAUSPADDRESS",
      trustTier: "silver",
      verifiedGovernment: false,
      liveSince: "2026-01-01T00:00:00.000Z",
      totalQueriesServed: 42,
    });
    expect(result).not.toHaveProperty("contact_email");
    expect(result).not.toHaveProperty("tier12_earnings_accrued");
  });
});

describe("toPublicEndpoint", () => {
  it("maps nested geography/timePeriod/sovereignty groups", () => {
    const result = toPublicEndpoint(endpointRow);
    expect(result.id).toBe("end-1");
    expect(result.providerId).toBe("prov-1");
    expect(result.geography).toEqual({ countries: ["Fiji"], region: "Pacific" });
    expect(result.timePeriod).toEqual({ start: 2010, end: 2024 });
    expect(result.sovereignty.commercialLicenceRequired).toBe(false);
    expect(result.pricingTiers).toEqual([{ tier: 1, name: "Summary", price_usdc: 0.01, path: "/summary" }]);
  });
});
