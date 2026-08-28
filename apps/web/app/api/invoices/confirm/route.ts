import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendDeploymentReceipt } from "@/lib/email/resend";

/**
 * Session 37B, Deliverable 4 (Email C trigger). The build prompt offered
 * two options: a Postgres Database Function + Trigger calling a Supabase
 * Edge Function when payment_confirmed_at changes, or this simpler
 * fallback — an internal-API-key-gated Route Handler SBP calls manually.
 *
 * Chose the fallback. Confirmed via the read-first investigation: this
 * repo has zero Supabase Edge Functions anywhere (supabase/ contains only
 * migrations/), and Resend has never been called from Postgres/Deno in
 * this codebase — every existing email send happens from an application
 * service layer (apps/directory-api/src/lib/email.ts). Standing up Edge
 * Functions from scratch (new deployment target, new secret management
 * inside Supabase's own environment, a pg_net-based trigger) is a much
 * bigger lift than one more Next.js Route Handler using infrastructure
 * that already exists (createServiceClient, lib/email/resend.ts) — exactly
 * the "significant complexity" case the prompt said to fall back on.
 *
 * Same X-Internal-Api-Key shared-secret pattern as
 * apps/directory-api/src/middleware/internalAuth.ts — a single trusted
 * backend credential compared server-side, not a per-user credential.
 * SBP calls this manually (e.g. via curl) after confirming a payment,
 * rather than a Postgres trigger firing automatically — sets
 * payment_confirmed_at and payment_status: 'confirmed', then sends the
 * receipt email in the same request.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const providedKey = request.headers.get("x-internal-api-key");
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey || !providedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: "unauthorized", message: "Missing or invalid X-Internal-Api-Key header." }, { status: 401 });
  }

  const body = (await request.json().catch(() => undefined)) as { invoice_id?: string } | undefined;
  const invoiceId = body?.invoice_id;
  if (!invoiceId) {
    return NextResponse.json({ error: "invalid_request", message: "invoice_id is required." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: invoice, error: fetchError } = await supabase
    .from("deployment_invoices")
    .select("id, invoice_reference, deployment_tier, payment_confirmed_at, provider_id, providers(institution_name, contact_email)")
    .eq("id", invoiceId)
    .maybeSingle();

  if (fetchError || !invoice) {
    return NextResponse.json({ error: "not_found", message: "No deployment_invoices row matches invoice_id." }, { status: 404 });
  }
  if (invoice.payment_confirmed_at) {
    return NextResponse.json({ error: "already_confirmed", message: "This invoice was already confirmed." }, { status: 409 });
  }

  const confirmedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("deployment_invoices")
    .update({ payment_status: "confirmed", payment_confirmed_at: confirmedAt })
    .eq("id", invoiceId);

  if (updateError) {
    return NextResponse.json({ error: "database_error", message: updateError.message }, { status: 502 });
  }

  const provider = invoice.providers as unknown as { institution_name: string; contact_email: string } | null;
  if (provider) {
    await sendDeploymentReceipt({
      providerEmail: provider.contact_email,
      providerName: provider.institution_name,
      invoiceReference: invoice.invoice_reference as string,
      deploymentTier: invoice.deployment_tier as string,
      confirmedAt,
    });

    const { error: receiptTimestampError } = await supabase
      .from("deployment_invoices")
      .update({ receipt_sent_at: new Date().toISOString() })
      .eq("id", invoiceId);
    if (receiptTimestampError) {
      console.error("[deployment_invoice_receipt_timestamp_update_failed]", { error: receiptTimestampError.message, invoiceId });
    }
  }

  return NextResponse.json({ success: true, invoiceReference: invoice.invoice_reference, confirmedAt }, { status: 200 });
}
