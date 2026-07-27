import type { Endpoint as EndpointRow, Provider as ProviderRow, PublicEndpoint, PublicProvider } from "@pdc/shared-types";

export type { PublicEndpoint, PublicProvider } from "@pdc/shared-types";

/**
 * Buyer/agent-facing shapes. Internal operational fields (fee accrual,
 * onboarding state, suspension reasons, contact details) are deliberately
 * left out — those belong to the provider dashboard (Component 6), not the
 * public/PDC directory (CLAUDE.md P10: SBP verifies identity and records
 * signals, nothing about a provider's internal billing state is the buyer's
 * business). Shapes live in @pdc/shared-types/api.ts; the mapping logic
 * (DB row -> public shape) stays here since it's app-specific behaviour, not
 * a shared type.
 */
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
