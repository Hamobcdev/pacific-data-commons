/**
 * Hand-written row shapes mirroring supabase/migrations/session1_migration.sql.
 * Scoped to the columns this API actually reads. If a future session adds
 * `supabase gen types typescript`, these should be replaced by the generated
 * Database type — do that once, don't hand-maintain both.
 */

export interface ProviderRow {
  id: string;
  institution_name: string;
  institution_type: string;
  provider_track: "international" | "ogip_government";
  country: string;
  verified_domain: string | null;
  wallet_address: string | null;
  usdc_opted_in: boolean;
  trust_tier: "bronze" | "silver" | "gold";
  verified_government: boolean;
  is_active: boolean;
  went_live_at: string | null;
  total_queries_served: number;
  last_query_at: string | null;
  created_at: string;
}

export interface EndpointRow {
  id: string;
  provider_id: string;
  endpoint_url: string | null;
  health_check_url: string | null;
  integrity_url: string | null;
  data_category: string;
  data_sub_category: string | null;
  title: string;
  description: string;
  geography_country: string[] | null;
  geography_region: string | null;
  time_period_start: number | null;
  time_period_end: number | null;
  update_frequency: string | null;
  spatial_resolution: string | null;
  data_format: string | null;
  languages: string[] | null;
  sample_size: string | null;
  commercial_eligibility: string | null;
  sensitivity_level: string | null;
  pricing_tiers: unknown;
  max_tier_at_bronze: number;
  sample_response: unknown;
  query_parameters: unknown;
  rate_limit: string | null;
  response_time_sla: string | null;
  indigenous_data_flag: boolean;
  cultural_sensitivity: string;
  sovereignty_framework: string | null;
  permitted_use_cases: string[] | null;
  attribution_required: boolean;
  attribution_format: string | null;
  commercial_licence_req: boolean;
  donor_conditions: string | null;
  competition_tag: string | null;
  bazaar_registered: boolean;
  skills_file_url: string | null;
  health_status: string;
  last_health_check_at: string | null;
  total_queries: number;
  total_revenue_usdc: number;
  last_queried_at: string | null;
  is_active: boolean;
  paused_reason: string | null;
  paused_at: string | null;
  created_at: string;
}

export interface ProvenanceCertificateRow {
  id: string;
  provider_id: string;
  endpoint_id: string;
  algo_asset_id: string | null;
  cert_hash: string;
  dataset_content_hash: string | null;
  cert_json: Record<string, unknown>;
  trust_tier: "bronze" | "silver" | "gold";
  status: "pending" | "active" | "expired" | "revoked" | "suspended";
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  issued_by: string;
}
