import type { EndpointRow, ProviderRow } from "../lib/dbTypes.js";

/**
 * Buyer/agent-facing shapes. Internal operational fields (fee accrual,
 * onboarding state, suspension reasons, contact details) are deliberately
 * left out — those belong to the provider dashboard (Component 6), not the
 * public/PDC directory (CLAUDE.md P10: SBP verifies identity and records
 * signals, nothing about a provider's internal billing state is the buyer's
 * business).
 */
export interface PublicProvider {
  id: string;
  institutionName: string;
  institutionType: string;
  country: string;
  verifiedDomain: string | null;
  walletAddress: string | null;
  trustTier: "bronze" | "silver" | "gold";
  verifiedGovernment: boolean;
  liveSince: string | null;
  totalQueriesServed: number;
}

export function toPublicProvider(row: ProviderRow): PublicProvider {
  return {
    id: row.id,
    institutionName: row.institution_name,
    institutionType: row.institution_type,
    country: row.country,
    verifiedDomain: row.verified_domain,
    walletAddress: row.wallet_address,
    trustTier: row.trust_tier,
    verifiedGovernment: row.verified_government,
    liveSince: row.went_live_at,
    totalQueriesServed: row.total_queries_served,
  };
}

export interface PublicEndpoint {
  id: string;
  providerId: string;
  dataCategory: string;
  dataSubCategory: string | null;
  title: string;
  description: string;
  geography: { countries: string[] | null; region: string | null };
  timePeriod: { start: number | null; end: number | null };
  updateFrequency: string | null;
  spatialResolution: string | null;
  dataFormat: string | null;
  languages: string[] | null;
  pricingTiers: unknown;
  maxTierAtBronze: number;
  sampleResponse: unknown;
  queryParameters: unknown;
  rateLimit: string | null;
  responseTimeSla: string | null;
  sovereignty: {
    indigenousDataFlag: boolean;
    culturalSensitivity: string;
    permittedUseCases: string[] | null;
    attributionRequired: boolean;
    attributionFormat: string | null;
    commercialLicenceRequired: boolean;
    donorConditions: string | null;
  };
  competitionTag: string | null;
  skillsFileUrl: string | null;
  healthStatus: string;
  totalQueries: number;
  isActive: boolean;
  pausedReason: string | null;
  endpointUrl: string | null;
  integrityUrl: string | null;
}

export function toPublicEndpoint(row: EndpointRow): PublicEndpoint {
  return {
    id: row.id,
    providerId: row.provider_id,
    dataCategory: row.data_category,
    dataSubCategory: row.data_sub_category,
    title: row.title,
    description: row.description,
    geography: { countries: row.geography_country, region: row.geography_region },
    timePeriod: { start: row.time_period_start, end: row.time_period_end },
    updateFrequency: row.update_frequency,
    spatialResolution: row.spatial_resolution,
    dataFormat: row.data_format,
    languages: row.languages,
    pricingTiers: row.pricing_tiers,
    maxTierAtBronze: row.max_tier_at_bronze,
    sampleResponse: row.sample_response,
    queryParameters: row.query_parameters,
    rateLimit: row.rate_limit,
    responseTimeSla: row.response_time_sla,
    sovereignty: {
      indigenousDataFlag: row.indigenous_data_flag,
      culturalSensitivity: row.cultural_sensitivity,
      permittedUseCases: row.permitted_use_cases,
      attributionRequired: row.attribution_required,
      attributionFormat: row.attribution_format,
      commercialLicenceRequired: row.commercial_licence_req,
      donorConditions: row.donor_conditions,
    },
    competitionTag: row.competition_tag,
    skillsFileUrl: row.skills_file_url,
    healthStatus: row.health_status,
    totalQueries: row.total_queries,
    isActive: row.is_active,
    pausedReason: row.paused_reason,
    endpointUrl: row.endpoint_url,
    integrityUrl: row.integrity_url,
  };
}
