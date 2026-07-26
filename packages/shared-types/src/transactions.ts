/** Mirrors `transactions_log` (session1_migration.sql, DOMAIN 3). */
export type TransactionType =
  | "directory_query"
  | "data_query_tier1"
  | "data_query_tier2"
  | "data_query_tier3"
  | "data_query_tier4"
  | "data_query_tier5"
  | "sbp_fee_invoice"
  | "pipeline_fee"
  | "trust_upgrade_fee";

export interface TransactionLogEntry {
  id: string;
  transaction_type: TransactionType;

  provider_id: string | null;
  endpoint_id: string | null;

  algo_tx_id: string | null;
  amount_usdc: number;
  pricing_tier: number | null;

  provider_amount: number | null;
  sbp_fee_amount: number | null;
  split_executed: boolean;
  split_tx_id: string | null;

  buyer_wallet_address: string | null;
  buyer_country: string | null;
  anonymised_at: string | null;

  query_parameters: Record<string, unknown> | null;
  response_tier: string | null;
  response_time_ms: number | null;

  queried_at: string;
}

/** Mirrors `sbp_fee_invoices` (session1_migration.sql, DOMAIN 3). Unique on
 * (provider_id, period_start, period_end) — required for
 * increment_tier12_accrual()'s ON CONFLICT DO NOTHING to have a target. */
export type SbpFeeInvoiceStatus = "pending" | "due" | "notified" | "overdue" | "paused" | "settled" | "disputed" | "waived";

export interface SbpFeeInvoice {
  id: string;
  provider_id: string;

  period_start: string;
  period_end: string;
  tier12_revenue_total: number;
  sbp_fee_rate: number;
  sbp_fee_amount: number;

  status: SbpFeeInvoiceStatus;

  threshold_crossed_at: string | null;
  notice_sent_at: string | null;
  due_by: string | null;
  pause_at: string | null;
  settled_at: string | null;
  settlement_tx_id: string | null;

  rolled_over_from: string | null;

  created_at: string;
}
