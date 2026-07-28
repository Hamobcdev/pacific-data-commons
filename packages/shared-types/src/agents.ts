/**
 * Mirrors the agent-infrastructure tables added by
 * supabase/migrations/session6_1_agent_schema.sql exactly (agents,
 * agent_run_endpoints, seasonal_contexts). Field-for-field — do not add
 * convenience fields here; that's what per-app projection types are for.
 */

export type AgentType =
  | "trade_intelligence"
  | "climate_risk"
  | "fisheries_status"
  | "agricultural_exports"
  | "remittance_navigator"
  | "grant_matcher"
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
