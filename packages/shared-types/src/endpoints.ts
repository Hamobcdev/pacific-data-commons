/**
 * Mirrors the `endpoints` table exactly (supabase/migrations/session1_migration.sql,
 * DOMAIN 1). This is the full column set — several fields here
 * (geography_geojson, spatial_resolution, data_format, languages, sample_size,
 * rate_limit, response_time_sla, bazaar_registered_at, skills_file_*,
 * last_health_check_at, paused_at) exist on the real table but were missing
 * from the Session 4 prompt's own draft of this type; included here because
 * "matches the Session 1 schema exactly" means the whole table, not a subset.
 */

export type DataCategory =
  | "fisheries"
  | "climate"
  | "trade"
  | "demographics"
  | "health"
  | "agriculture"
  | "cultural"
  | "remittance"
  | "legal"
  | "geospatial"
  | "energy"
  | "carbon"
  | "tourism"
  | "disaster_risk"
  | "biodiversity"
  | "ocean"
  | "education"
  | "other";

export type UpdateFrequency = "real-time" | "daily" | "monthly" | "annual" | "static" | "irregular";

export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

export type CulturalSensitivity = "none" | "low" | "medium" | "high";

export type SensitivityLevel = "public" | "internal" | "restricted" | "classified";

export type PersonalDataFlag = "non_personal" | "anonymised" | "pseudonymised" | "personal";

export type CommercialEligibility = "fully_commercial" | "research_only" | "government_only" | "community_consent";

/** JSONB — not a foreign-keyed table, so this shape is a convention, not a
 * schema constraint. tier/price_usdc/path are load-bearing (read by search
 * filtering and provider endpoint templates); name/description are
 * display-only but populated by every real usage so far (seed script,
 * pilot-endpoint). */
export interface PricingTier {
  tier: 1 | 2 | 3 | 4 | 5;
  name: string;
  description: string;
  price_usdc: number;
  path: string;
}

export interface Endpoint {
  id: string;
  provider_id: string;

  endpoint_url: string | null;
  health_check_url: string | null;
  integrity_url: string | null;

  data_category: DataCategory;
  data_sub_category: string | null;
  title: string;
  description: string;

  geography_country: string[] | null;
  geography_region: string | null;
  geography_geojson: Record<string, unknown> | null;

  time_period_start: number | null;
  time_period_end: number | null;
  update_frequency: UpdateFrequency | null;

  spatial_resolution: string | null;
  data_format: string | null;
  languages: string[] | null;
  sample_size: string | null;

  // Government track only — NULL for international (P3)
  sensitivity_level: SensitivityLevel | null;
  personal_data_flag: PersonalDataFlag | null;
  commercial_eligibility: CommercialEligibility | null;

  pricing_tiers: PricingTier[];
  max_tier_at_bronze: number;

  sample_response: Record<string, unknown> | null;
  query_parameters: Record<string, unknown> | null;
  rate_limit: string | null;
  response_time_sla: string | null;

  // Sovereignty fields — mandatory for all endpoints
  indigenous_data_flag: boolean;
  cultural_sensitivity: CulturalSensitivity;
  sovereignty_framework: string | null;
  permitted_use_cases: string[];
  attribution_required: boolean;
  attribution_format: string | null;
  commercial_licence_req: boolean;
  donor_conditions: string | null;
  community_consent_doc: string | null;
  traditional_knowledge: boolean;

  competition_tag: string;
  bazaar_registered: boolean;
  bazaar_registered_at: string | null;

  skills_file_agentmarket: Record<string, unknown> | null;
  skills_file_pdp: Record<string, unknown> | null;
  skills_file_url: string | null;

  health_status: HealthStatus;
  last_health_check_at: string | null;
  consecutive_health_fails: number;

  total_queries: number;
  total_revenue_usdc: number;
  last_queried_at: string | null;

  is_active: boolean;
  paused_reason: string | null;
  paused_at: string | null;

  created_at: string;
  updated_at: string;
}
