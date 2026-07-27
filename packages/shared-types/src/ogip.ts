/**
 * OGIP-layer types only. Jurisdiction exists ONLY here — never on PDC
 * international layer types (Provider, Endpoint in providers.ts/endpoints.ts)
 * per P3 / Decision 19. Mirrors session1_migration.sql DOMAIN 6.
 */

export type JurisdictionType = "nation" | "regional" | "intergovernmental";

export interface OgipJurisdiction {
  code: string;
  name: string;
  jurisdiction_type: JurisdictionType;
  fund_wallet_address: string | null;
  ogip_active: boolean;
  created_at: string;
}

export type MinistryType =
  | "statistics"
  | "finance"
  | "agriculture"
  | "health"
  | "environment"
  | "fisheries"
  | "education"
  | "trade"
  | "communications"
  | "central_bank"
  | "other";

export type OgipRevenueModel = "A" | "B" | "C";

export type OgipMinistryStatus = "registered" | "approval_pending" | "connected" | "active" | "suspended";

export interface OgipMinistry {
  id: string;
  jurisdiction_code: string;

  ministry_name: string;
  ministry_type: MinistryType | null;
  contact_email: string;
  data_officer_name: string | null;
  data_officer_email: string | null;

  cabinet_approval_ref: string | null;
  cabinet_approval_date: string | null;

  ogip_connected: boolean;
  ogip_connection_id: string | null;
  ogip_connected_at: string | null;

  // Decision 11b default 75/20/5 (provider/fund/SBP)
  revenue_model: OgipRevenueModel;
  provider_pct: number;
  fund_pct: number;
  sbp_pct: number;

  status: OgipMinistryStatus;
  is_active: boolean;

  created_at: string;
  updated_at: string;
}

export type OgipCommercialEligibility = "fully_commercial" | "research_only" | "government_only" | "community_consent";
export type OgipSensitivityLevel = "public" | "internal" | "restricted" | "classified";

export interface OgipEndpoint {
  id: string;
  ministry_id: string;
  jurisdiction_code: string;

  internal_ogip_url: string | null;

  /** Set when this OGIP dataset is also listed on the PDC international
   * directory (Decision 13: international full rate) — FK into
   * endpoints.ts's Endpoint.id, not embedded here to avoid a circular type
   * dependency between the two domains. */
  pdc_endpoint_id: string | null;
  commercial_eligibility: OgipCommercialEligibility | null;

  data_category: string;
  title: string;
  description: string;

  sensitivity_level: OgipSensitivityLevel;
  personal_data_flag: string | null;
  export_clearance: boolean;

  internal_price_wst: number;

  is_active: boolean;
  created_at: string;
}

export interface OgipCreditLedgerEntry {
  id: string;
  providing_ministry_id: string;
  requesting_ministry_id: string;
  ogip_endpoint_id: string;
  jurisdiction_code: string;

  credit_amount_wst: number;
  query_timestamp: string;

  settlement_period: string | null;
  settled: boolean;
  settled_at: string | null;

  /** Always false during POC Phase 0 (Decision 24) — non-monetary
   * contribution score until WST settlement begins in Phase 2. */
  is_monetary: boolean;
}
