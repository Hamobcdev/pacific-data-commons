/**
 * Mirrors the `deployment_invoices` table exactly
 * (supabase/migrations/session37_deployment_invoices.sql, Session 37B).
 */

export type DeploymentTier = "self_service" | "assisted" | "complex";

export type DeploymentPaymentMethod = "usdc" | "bank_transfer" | "not_applicable";

export type DeploymentPaymentStatus =
  | "not_required"
  | "pending"
  | "submitted"
  | "confirmed"
  | "bank_transfer_pending"
  | "cancelled";

export interface DeploymentInvoice {
  id: string;
  provider_id: string;
  formatting_run_id: string | null;

  invoice_reference: string;
  deployment_tier: DeploymentTier;

  invoice_amount_usdc: number | null;
  payment_method: DeploymentPaymentMethod | null;
  payment_status: DeploymentPaymentStatus;

  payment_submitted_at: string | null;
  payment_tx_id: string | null;
  payment_bank_ref: string | null;

  payment_confirmed_at: string | null;

  acknowledgement_sent_at: string | null;
  sbp_notification_sent_at: string | null;
  receipt_sent_at: string | null;

  notes: string | null;

  created_at: string;
  updated_at: string;
}
