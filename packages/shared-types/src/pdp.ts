/**
 * Pacific Data Protocol v1.0 response envelope — the shared base shape every
 * provider endpoint's paid routes return (CLAUDE.md Decision 15 / Section
 * 10). Verified against apps/pilot-endpoint/src/lib/response.ts, which this
 * mirrors exactly for the fields common to every category; `data`,
 * `category`, `sub_category`, and `paid_tier` are intentionally left generic
 * here (`unknown` / `string`) since they vary per data category — a provider
 * endpoint app narrows them locally (see pilot-endpoint's own PDPResponse).
 */
import type { DataCategory } from "./endpoints.js";
import type { TrustTier } from "./providers.js";

export interface PDPProviderBlock {
  institution: string;
  country: string;
  trust_tier: TrustTier;
  competition_tag: string;
  /** The canonical dataset hash — computed once at startup, never per-request (R7). */
  provenance_hash: string;
  integrity_url: string;
}

export interface PDPQueryBlock {
  parameters_received: Record<string, string>;
  parameters_applied: Record<string, string>;
  records_returned: number;
  records_total: number;
}

export interface PDPResponseBase {
  schema_version: "pdp-1.0";
  category: DataCategory;
  sub_category: string;
  /** Always present — no paid response may omit the synthetic/real-data notice. */
  data_warning: string;
  provider: PDPProviderBlock;
  query: PDPQueryBlock;
  data: unknown;
  methodology_summary: string;
  citation: string;
  accessed_at: string;
  paid_tier: string;
  amount_paid_usdc: number;
}
