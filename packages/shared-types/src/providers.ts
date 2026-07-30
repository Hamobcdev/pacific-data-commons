/**
 * Mirrors the `providers` table exactly (supabase/migrations/session1_migration.sql,
 * DOMAIN 1). Field-for-field — do not add convenience fields here; that's what
 * per-app projection types (e.g. apps/directory-api's PublicProvider) are for.
 */

export type InstitutionType = "university" | "government" | "ngo" | "private" | "cultural" | "intergovernmental";

export type ProviderTrack = "international" | "ogip_government";

export type TrustTier = "bronze" | "silver" | "gold";

export type OnboardingStatus =
  | "registered"
  | "wallet_setup"
  | "verification_pending"
  | "verified"
  | "active"
  | "suspended"
  | "inactive";

export interface Provider {
  id: string;
  institution_name: string;
  institution_type: InstitutionType;
  provider_track: ProviderTrack;
  country: string;
  verified_domain: string | null;
  contact_email: string;
  contact_name: string | null;

  wallet_address: string | null;
  usdc_opted_in: boolean;
  wallet_verified_at: string | null;

  trust_tier: TrustTier;
  verified_government: boolean;

  // Revenue split (PDC international: 97/3 — Decision 11. OGIP government: configurable)
  provider_pct: number;
  sbp_fee_pct: number;

  // SBP fee collection (Tier 1-2 monthly settlement — Decision 31)
  fee_collection_consent: boolean;
  tier12_earnings_accrued: number;
  fee_threshold_usdc: number;
  last_fee_settled_at: string | null;
  fee_settlement_due_at: string | null;

  onboarding_status: OnboardingStatus;
  onboarding_started_at: string;
  went_live_at: string | null;

  is_active: boolean;
  suspended_reason: string | null;
  suspended_at: string | null;

  total_queries_served: number;
  total_revenue_usdc: number;
  last_query_at: string | null;

  /** Bidirectional wallet (Part 6 §1A) — running total this provider's
   * wallet has spent querying agents. Added by
   * session6_1_agent_schema.sql DOMAIN 8; missing from this file until
   * Session 7 added it. */
  agent_spend_usdc: number;

  created_at: string;
  updated_at: string;
}
