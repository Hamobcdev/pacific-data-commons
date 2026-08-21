"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { validateOnboardingSession, InvalidOnboardingSessionError } from "@/lib/onboarding/session";
import { UPLOAD_FEE_USDC, SCANNED_PDF_SURCHARGE_USDC } from "@/lib/upload/constants";

export interface FoundingPartnerEligibility {
  eligible: boolean;
  /** founding_partner_free_limit - pipeline_datasets_used, clamped >= 0. */
  remaining: number;
  limit: number;
}

export interface UploadPaymentStatusResult {
  success: boolean;
  status?: "unpaid" | "pending" | "confirmed";
  paymentMethod?: "usdc" | "stripe" | "invoice" | null;
  error?: string;
  /** Session 28 — set whenever the founding_partner read succeeds,
   * regardless of eligibility, so UploadPaymentGate can distinguish "not a
   * founding partner" from "founding partner, quota exhausted" if it ever
   * needs to (currently both fall through to the same $25 gate). Absent
   * (not false) only if the providers read itself failed — in which case
   * the gate fails closed to the existing $25 flow, never a free bypass. */
  foundingPartner?: FoundingPartnerEligibility;
}

/**
 * Session 23 (Decision 58) — checks whether this provider's current dataset
 * cycle (dataset_slot = their onboarding_session_token, see this session's
 * migration doc comment) has a confirmed upload_payments row. Called by
 * UploadPaymentGate.tsx before it will render UploadForm.
 *
 * Session 28 — also resolves founding-partner eligibility here rather than
 * a second round trip: founding_partner is the *only* exemption from this
 * gate (Decision 58 — cold inbound uploads are never otherwise free, see
 * the doc comment on session23_upload_payments.sql). If the providers read
 * fails, foundingPartner is simply omitted and the caller falls through to
 * the normal paid flow — a transient read failure must never grant a free
 * bypass.
 */
export async function checkUploadPaymentStatus(providerId: string, sessionToken: string): Promise<UploadPaymentStatusResult> {
  try {
    await validateOnboardingSession(providerId, sessionToken);
  } catch (err) {
    return { success: false, error: err instanceof InvalidOnboardingSessionError ? err.message : "Invalid session." };
  }

  const supabase = createServiceClient();

  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .select("founding_partner, pipeline_datasets_used, founding_partner_free_limit")
    .eq("id", providerId)
    .maybeSingle();

  const foundingPartner: FoundingPartnerEligibility | undefined =
    providerError || !provider
      ? undefined
      : {
          eligible: provider.founding_partner === true && (provider.pipeline_datasets_used as number) < (provider.founding_partner_free_limit as number),
          remaining: Math.max(0, (provider.founding_partner_free_limit as number) - (provider.pipeline_datasets_used as number)),
          limit: provider.founding_partner_free_limit as number,
        };

  if (foundingPartner?.eligible) {
    return { success: true, status: "unpaid", paymentMethod: null, foundingPartner };
  }

  const { data, error } = await supabase
    .from("upload_payments")
    .select("payment_status, payment_method")
    .eq("provider_id", providerId)
    .eq("dataset_slot", sessionToken)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { success: false, error: "Could not check payment status. Please try again." };
  }
  if (!data) {
    return { success: true, status: "unpaid", paymentMethod: null, foundingPartner };
  }

  return {
    success: true,
    status: data.payment_status as "pending" | "confirmed",
    paymentMethod: data.payment_method as "usdc" | "stripe" | "invoice" | null,
    foundingPartner,
  };
}

export interface SubmitUploadPaymentResult {
  success: boolean;
  error?: string;
}

/**
 * Provider-submitted claim that they sent the USDC fee to SBP's collection
 * wallet. Recorded as 'pending', never auto-confirmed — see
 * UploadPaymentGate.tsx's doc comment for why on-chain verification is a
 * manual step in this session rather than automated indexer polling.
 */
export async function submitUsdcPaymentClaim(
  providerId: string,
  sessionToken: string,
  algoTxId: string,
  pdfSurcharge: boolean,
): Promise<SubmitUploadPaymentResult> {
  try {
    await validateOnboardingSession(providerId, sessionToken);
  } catch (err) {
    return { success: false, error: err instanceof InvalidOnboardingSessionError ? err.message : "Invalid session." };
  }

  const trimmedTxId = algoTxId.trim();
  if (trimmedTxId.length < 10) {
    return { success: false, error: "That doesn't look like a valid transaction ID." };
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("upload_payments").insert({
    provider_id: providerId,
    dataset_slot: sessionToken,
    amount_usdc: UPLOAD_FEE_USDC + (pdfSurcharge ? SCANNED_PDF_SURCHARGE_USDC : 0),
    algo_tx_id: trimmedTxId,
    payment_method: "usdc",
    payment_status: "pending",
    pdf_surcharge: pdfSurcharge,
  });

  if (error) {
    return { success: false, error: "Could not record your payment claim. Please try again or request an invoice instead." };
  }

  return { success: true };
}

/**
 * Provider requests an invoice instead of paying with a wallet. Recorded as
 * 'pending' — no email/notification is wired up yet (this app has no
 * transactional email sender configured; see CLAUDE.md §26.4). SBP must
 * currently check the upload_payments table directly for new invoice
 * requests until that's built.
 */
export async function requestUploadInvoice(providerId: string, sessionToken: string, pdfSurcharge: boolean): Promise<SubmitUploadPaymentResult> {
  try {
    await validateOnboardingSession(providerId, sessionToken);
  } catch (err) {
    return { success: false, error: err instanceof InvalidOnboardingSessionError ? err.message : "Invalid session." };
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("upload_payments").insert({
    provider_id: providerId,
    dataset_slot: sessionToken,
    amount_usdc: UPLOAD_FEE_USDC + (pdfSurcharge ? SCANNED_PDF_SURCHARGE_USDC : 0),
    payment_method: "invoice",
    payment_status: "pending",
    pdf_surcharge: pdfSurcharge,
  });

  if (error) {
    return { success: false, error: "Could not submit your invoice request. Please try again." };
  }

  return { success: true };
}
