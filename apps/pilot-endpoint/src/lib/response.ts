import { DATASET_METADATA, FISHERIES_RECORDS, type FisheriesRecord } from "../data/fisheries.js";

export type PaidTier = "summary" | "slice" | "full" | "expert";

export interface StockStatus {
  species: string;
  latest_year: number;
  stock_index: number;
  status: "healthy" | "moderate" | "depleted";
}

export interface SummaryData {
  total_records: number;
  species_covered: string[];
  zones_covered: string[];
  years_covered: number[];
  stock_status: StockStatus[];
  key_findings: string[];
}

/** Additional section the /expert handler spreads onto the base envelope —
 * not part of PDPResponse itself since only one of five tiers uses it. */
export interface ExpertAnnotations {
  stock_assessment_method: string;
  confidence_intervals: Record<string, { lower: number; upper: number; note: string }>;
  recommended_citation: string;
  data_limitations: string[];
  pdp_compliance: string;
}

export interface PDPResponse {
  schema_version: "pdp-1.0";
  category: "fisheries";
  sub_category: "tuna_stock_assessment";
  /** Always present — R6: no paid response may omit the synthetic-data notice. */
  data_warning: string;
  provider: {
    institution: string;
    country: string;
    trust_tier: "bronze";
    competition_tag: string;
    /** The canonical dataset hash — computed once at startup, never per-request. */
    provenance_hash: string;
    integrity_url: string;
  };
  query: {
    parameters_received: Record<string, string>;
    parameters_applied: Record<string, string>;
    records_returned: number;
    records_total: number;
  };
  data: FisheriesRecord[] | SummaryData;
  methodology_summary: string;
  citation: string;
  accessed_at: string;
  paid_tier: PaidTier;
  amount_paid_usdc: number;
}

/**
 * Builds a complete PDP v1.0 response envelope. Every paid route handler
 * calls this — never build the envelope manually, so `data_warning` (R6) and
 * `provenance_hash` (R7) can never be accidentally dropped from a response.
 * The /expert handler spreads an additional `expert_annotations` field on
 * top of this envelope's return value; every other tier returns it as-is.
 */
export function buildPDPResponse(params: {
  tier: PaidTier;
  amountPaidUsdc: number;
  data: FisheriesRecord[] | SummaryData;
  queryReceived: Record<string, string>;
  queryApplied: Record<string, string>;
  datasetHash: string;
  publicUrl: string;
}): PDPResponse {
  const recordsReturned = Array.isArray(params.data) ? params.data.length : params.data.total_records;

  return {
    schema_version: "pdp-1.0",
    category: "fisheries",
    sub_category: "tuna_stock_assessment",
    data_warning: DATASET_METADATA.data_warning,
    provider: {
      institution: DATASET_METADATA.institution,
      country: DATASET_METADATA.country,
      trust_tier: "bronze",
      competition_tag: DATASET_METADATA.competition_tag,
      provenance_hash: params.datasetHash,
      integrity_url: `${params.publicUrl}/integrity`,
    },
    query: {
      parameters_received: params.queryReceived,
      parameters_applied: params.queryApplied,
      records_returned: recordsReturned,
      // Always the full dataset size, regardless of tier — "how many exist"
      // as context for "how many you got back" (query.records_returned).
      records_total: FISHERIES_RECORDS.length,
    },
    data: params.data,
    methodology_summary: DATASET_METADATA.methodology_summary,
    citation: DATASET_METADATA.citation,
    accessed_at: new Date().toISOString(),
    paid_tier: params.tier,
    amount_paid_usdc: params.amountPaidUsdc,
  };
}
