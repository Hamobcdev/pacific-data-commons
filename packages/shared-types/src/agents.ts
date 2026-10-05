/**
 * Mirrors the agent-infrastructure tables added by
 * supabase/migrations/session6_1_agent_schema.sql exactly (agents,
 * agent_run_endpoints, seasonal_contexts). Field-for-field — do not add
 * convenience fields here; that's what per-app projection types are for.
 */
import type { CulturalSensitivity } from "./endpoints.js";
import type { TrustTier } from "./providers.js";

export type AgentType =
  | "trade_intelligence"
  | "climate_risk"
  | "fisheries_status"
  | "agricultural_exports"
  | "remittance_navigator"
  | "grant_matcher"
  | "financial_intelligence"
  | "third_party";

export type AgentVerificationTier = "unverified" | "verified" | "certified";

export type AttributionStatus = "pending" | "verified" | "unmatched" | "compliance_flagged";

export type AgentCachingPolicy = "per_run" | "ttl_cache" | "unrestricted";

export type SeasonalDomain = "fisheries" | "agriculture" | "climate";

export type AgentComplianceEventKind = "notice" | "suspension" | "critical" | "resolved";

export interface Agent {
  id: string;
  agent_name: string;
  agent_type: AgentType;
  developer_id: string | null;
  operational_wallet: string;
  verification_tier: AgentVerificationTier;
  respects_indigenous_flag: boolean;
  respects_cultural_sensitivity: boolean;
  commission_pct: number;
  commission_accrued_usdc: number;
  commission_threshold: number;
  last_commission_settled: string | null;
  is_active: boolean;
  listed_at: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  description: string | null;
  skills_file_url: string | null;
  version: string;
  created_at: string;
  updated_at: string;
}

export interface AgentRunAttribution {
  id: string;
  run_id: string;
  agent_id: string;
  endpoint_tx_ids: string[];
  originating_user_wallet_hash: string;
  attribution_status: AttributionStatus;
  signed_by: string;
  signature: string;
  reconciled_at: string | null;
  reconciliation_notes: string | null;
  submitted_at: string;
}

export interface AgentComplianceEvent {
  id: string;
  agent_id: string;
  kind: AgentComplianceEventKind;
  basis: string;
  evidence: Record<string, unknown> | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

export type WalletLinkEntityType = "provider" | "agent_operational" | "agent_developer" | "buyer";

export interface WalletLink {
  wallet_address: string;
  entity_type: WalletLinkEntityType;
  entity_id: string;
  verified_at: string;
}

export interface SeasonalContext {
  id: string;
  geography_scope: string;
  domain: SeasonalDomain;
  season_label: string;
  month_start: number;
  month_end: number;
  context_notes: string;
  data_sources: string[] | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  version: number;
}

/**
 * Attribution request payload (what agents POST to /agent/attribution —
 * Decision 37). `timestamp` is required here even though the Session 6.1
 * brief's example payload omitted it: the signed message format
 * (`pdc-attribution:v1:{run_id}:{agent_id}:{nonce}:{timestamp_iso}`,
 * documented in apps/directory-api/src/lib/algorandAttestation.ts) can't be
 * reconstructed server-side to verify the signature without it.
 */
export interface AttributionRequest {
  run_id: string;
  agent_id: string;
  endpoint_tx_ids: string[];
  originating_user_wallet_hash: string;
  signed_by: string;
  signature: string;
  nonce: string;
  timestamp: string;
}

/**
 * Agent run request/response shapes (Session 7 — Part 6 §1A, Decisions
 * 32-38). Shared between apps/agents (produces AgentOutput) and apps/web
 * (consumes it in server actions + renders it) so both sides of the HTTP
 * boundary use one definition instead of two independently-drifting copies.
 */

export interface AgentInput {
  agent_type: AgentType;
  parameters: Record<string, string>;
  /** Algorand address — user's identity, used only for the attribution
   * record's wallet hash. The user's wallet never pays endpoints (R2/Model F). */
  user_wallet: string;
  /** Always "en" at launch — Decision 33. */
  output_language: string;
  /** Preview endpoints/cost without paying (R8). */
  dry_run: boolean;
}

export interface EndpointPreview {
  endpoint_id: string;
  title: string;
  tier: number;
  price_usdc: number;
  /** Why this endpoint is being queried — shown to the user before they confirm. */
  reason: string;
}

export interface DataCitation {
  endpoint_id: string;
  endpoint_title: string;
  provider_institution: string;
  trust_tier: TrustTier;
  /** On-chain proof of payment. */
  algo_tx_id: string;
  amount_usdc: number;
  /** Dataset content hash (certificate v1.1 / PDPProviderBlock.provenance_hash). */
  provenance_hash: string;
}

/**
 * Session 19 / Decision 56 — a supplementary (never primary) external
 * x402-compatible data source an agent queried alongside its PDC endpoints.
 * Deliberately not shaped like DataCitation (no trust_tier/provenance_hash
 * — an external source is not part of the PDC trust-tier system and
 * carries no Pacific Data Protocol provenance certificate) so a reader
 * can't mistake an external citation for a PDC one.
 */
export interface ExternalSourceCitation {
  source_id: string;
  source_name: string;
  provider_name: string;
  algo_tx_id: string;
  amount_usdc: number;
}

export interface SovereigntyFlag {
  endpoint_id: string;
  indigenous_data_flag: boolean;
  cultural_sensitivity: CulturalSensitivity;
  note: string;
}

export interface AgentOutput {
  agent_type: AgentType;
  run_id: string;
  dry_run: boolean;

  /** Present only when dry_run is true. */
  preview?: {
    endpoints_to_query: EndpointPreview[];
    estimated_cost_usdc: number;
    output_shape: string;
  };

  /** Present only when dry_run is false and the run succeeded. */
  synthesis?: string;
  /** Claude's best-effort JSON parse of the synthesis output — shape varies
   * per agent (most return an object; grant_matcher returns an array), so
   * this is intentionally not narrowed further than `unknown`. */
  structured_data?: unknown;
  citations: DataCitation[];
  total_cost_usdc: number;
  generated_at: string;

  data_warning?: string;
  sovereignty_flags?: SovereigntyFlag[];
  /** Session 19 / Decision 56 — present only when the agent queried at
   * least one approved external source this run. PDC data (citations
   * above) is always primary; these are always supplementary context. */
  external_citations?: ExternalSourceCitation[];
}
