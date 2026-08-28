"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { validateOnboardingSession, InvalidOnboardingSessionError } from "@/lib/onboarding/session";
import { SESSION_EXPIRED_ERROR } from "@/lib/onboarding/session-constants";
import { generateInvoiceReference } from "@/lib/invoices/generateReference";
import { sendDeploymentAcknowledgement, sendDeploymentNotificationToSBP } from "@/lib/email/resend";
import { ASSISTED_DEPLOYMENT_PRICE_USDC } from "@/lib/deploy/pricing";

export interface DeploymentInvoiceResult {
  success: boolean;
  error?: string;
  invoiceReference?: string;
  invoiceId?: string;
  /** True when a payment must still be submitted before this request is
   * complete — only possible once ASSISTED_DEPLOYMENT_PRICE_USDC > 0. */
  paymentRequired?: boolean;
}

interface InsertedInvoice {
  id: string;
  invoice_reference: string;
}

/**
 * Inserts a deployment_invoices row, generating a fresh invoice_reference
 * per attempt. The UNIQUE constraint on invoice_reference is the safety net
 * against a race between two concurrent generations (Deliverable 2's own
 * doc comment) — one retry covers that case without adding real complexity
 * for a feature whose actual concurrency is "one provider submitting their
 * own single request."
 */
async function insertInvoiceWithRetry(
  supabase: ReturnType<typeof createServiceClient>,
  row: Record<string, unknown>,
): Promise<InsertedInvoice | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const invoiceReference = await generateInvoiceReference();
    const { data, error } = await supabase
      .from("deployment_invoices")
      .insert({ ...row, invoice_reference: invoiceReference })
      .select("id, invoice_reference")
      .single();

    if (!error && data) {
      return data as InsertedInvoice;
    }
    if (error?.code !== "23505") {
      // Not a unique-violation — retrying won't help.
      console.error("[deployment_invoice_insert_failed]", { error: error?.message });
      return null;
    }
    // 23505 (unique_violation on invoice_reference) — loop and retry with a
    // freshly generated reference.
  }
  return null;
}

/** Read-only preview for Card 2's inline expansion — shows the provider
 * what reference their request will get before they confirm. The
 * authoritative reference is generated again (with its own retry-on-
 * collision handling) inside requestAssistedDeployment() at actual insert
 * time, so this preview and the final reference can differ if two
 * providers expand the card at the same moment — acceptable at this
 * feature's real concurrency (see generateInvoiceReference()'s own doc
 * comment). */
export async function previewInvoiceReference(): Promise<string> {
  return generateInvoiceReference();
}

/** Card 1 — self-service. No payment, no email. Just a record of the
 * choice so a provider's full deployment history is queryable regardless
 * of tier. */
export async function requestSelfServiceDeployment(providerId: string, sessionToken: string): Promise<DeploymentInvoiceResult> {
  try {
    await validateOnboardingSession(providerId, sessionToken);
  } catch (err) {
    return { success: false, error: err instanceof InvalidOnboardingSessionError ? SESSION_EXPIRED_ERROR : "Invalid session." };
  }

  const supabase = createServiceClient();
  const inserted = await insertInvoiceWithRetry(supabase, {
    provider_id: providerId,
    deployment_tier: "self_service",
    payment_status: "not_required",
    payment_method: "not_applicable",
  });

  if (!inserted) {
    return { success: false, error: "Could not record your deployment request. Please try again." };
  }
  return { success: true, invoiceReference: inserted.invoice_reference };
}

/** Card 2 — SBP assisted. Records the request, then fires Email A
 * (provider acknowledgement) and Email B (SBP internal notification).
 * invoice_amount_usdc: 0 and payment_status: 'not_required' for the
 * Session 37B free promotional period (CLAUDE.md Section 7). */
export async function requestAssistedDeployment(providerId: string, sessionToken: string): Promise<DeploymentInvoiceResult> {
  try {
    await validateOnboardingSession(providerId, sessionToken);
  } catch (err) {
    return { success: false, error: err instanceof InvalidOnboardingSessionError ? SESSION_EXPIRED_ERROR : "Invalid session." };
  }

  const supabase = createServiceClient();

  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .select("institution_name, contact_email, country")
    .eq("id", providerId)
    .single();

  if (providerError || !provider) {
    console.error("[deployment_request_provider_lookup_failed]", { error: providerError?.message });
    return { success: false, error: "Could not find your registration. Please try again." };
  }

  const paymentRequired = ASSISTED_DEPLOYMENT_PRICE_USDC > 0;
  const inserted = await insertInvoiceWithRetry(supabase, {
    provider_id: providerId,
    deployment_tier: "assisted",
    invoice_amount_usdc: ASSISTED_DEPLOYMENT_PRICE_USDC,
    payment_status: paymentRequired ? "pending" : "not_required",
    payment_method: paymentRequired ? null : "not_applicable",
  });

  if (!inserted) {
    return { success: false, error: "Could not record your deployment request. Please try again." };
  }

  const submittedAt = new Date().toISOString();
  const institutionName = provider.institution_name as string;
  const contactEmail = provider.contact_email as string;

  await Promise.all([
    sendDeploymentAcknowledgement({
      providerEmail: contactEmail,
      providerName: institutionName,
      invoiceReference: inserted.invoice_reference,
      deploymentTier: "assisted",
      providerContactEmail: contactEmail,
    }),
    sendDeploymentNotificationToSBP({
      providerName: institutionName,
      providerEmail: contactEmail,
      invoiceReference: inserted.invoice_reference,
      deploymentTier: "assisted",
      providerCountry: (provider.country as string | null) ?? "unknown",
      submittedAt,
    }),
  ]);

  // Best-effort — the invoice and the emails (never-throwing, see
  // lib/email/resend.ts) have already succeeded/attempted by this point;
  // a failure here only means acknowledgement_sent_at stays null.
  const { error: updateError } = await supabase
    .from("deployment_invoices")
    .update({ acknowledgement_sent_at: submittedAt, sbp_notification_sent_at: submittedAt })
    .eq("id", inserted.id);
  if (updateError) {
    console.error("[deployment_invoice_email_timestamp_update_failed]", { error: updateError.message, invoiceId: inserted.id });
  }

  return { success: true, invoiceReference: inserted.invoice_reference, invoiceId: inserted.id, paymentRequired };
}

/**
 * Only reachable once ASSISTED_DEPLOYMENT_PRICE_USDC > 0 (see
 * AssistedCard.tsx's paid-tier branch) — records the provider's own
 * self-reported payment evidence. SBP still confirms receipt separately
 * via POST /api/invoices/confirm; this only moves payment_status from
 * 'pending' to 'submitted'/'bank_transfer_pending', it does not set
 * payment_confirmed_at.
 */
export async function submitDeploymentPayment(
  providerId: string,
  sessionToken: string,
  invoiceId: string,
  method: "usdc" | "bank_transfer",
  reference: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateOnboardingSession(providerId, sessionToken);
  } catch (err) {
    return { success: false, error: err instanceof InvalidOnboardingSessionError ? SESSION_EXPIRED_ERROR : "Invalid session." };
  }

  const trimmedReference = reference.trim();
  if (!trimmedReference) {
    return { success: false, error: method === "usdc" ? "Enter the Algorand transaction ID." : "Enter the bank transfer reference." };
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("deployment_invoices")
    .update({
      payment_method: method,
      payment_status: method === "usdc" ? "submitted" : "bank_transfer_pending",
      payment_submitted_at: new Date().toISOString(),
      ...(method === "usdc" ? { payment_tx_id: trimmedReference } : { payment_bank_ref: trimmedReference }),
    })
    .eq("id", invoiceId)
    .eq("provider_id", providerId);

  if (error) {
    console.error("[deployment_payment_submission_failed]", { error: error.message, invoiceId });
    return { success: false, error: "Could not record your payment. Please try again." };
  }

  return { success: true };
}
