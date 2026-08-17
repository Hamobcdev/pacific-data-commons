import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Session 23 (Deliverable 4) — handles `checkout.session.completed`.
 * Reads the raw request body (request.text(), not request.json()) because
 * Stripe's signature verification is computed over the exact bytes it
 * sent — any re-serialisation breaks the signature check.
 *
 * For purpose=deployment_standard|deployment_complex: no SBP notification
 * is sent — this app has no transactional email sender configured yet
 * (see CLAUDE.md §26.4 and upload-payment.ts's same documented gap).
 * Logged server-side instead of silently dropped.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "webhook_unavailable" }, { status: 503 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const purpose = session.metadata?.purpose;

    if (purpose === "upload_fee") {
      const providerId = session.metadata?.providerId;
      const datasetSlot = session.metadata?.datasetSlot;
      const pdfSurcharge = session.metadata?.pdfSurcharge === "true";

      if (!providerId || !datasetSlot) {
        console.error("Stripe webhook: upload_fee session missing providerId/datasetSlot metadata", session.id);
        return NextResponse.json({ received: true }, { status: 200 });
      }

      const supabase = createServiceClient();
      const { error } = await supabase.from("upload_payments").insert({
        provider_id: providerId,
        dataset_slot: datasetSlot,
        amount_usdc: (session.amount_total ?? 0) / 100,
        payment_method: "stripe",
        payment_status: "confirmed",
        pdf_surcharge: pdfSurcharge,
        confirmed_at: new Date().toISOString(),
      });

      if (error) {
        console.error("Stripe webhook: failed to record upload_payments row", session.id, error);
      }
    } else if (purpose === "deployment_standard" || purpose === "deployment_complex") {
      // No notification sender wired up yet — see this file's doc comment.
      console.log("Stripe deployment service payment received (no notification sent — email not configured):", {
        purpose,
        contactEmail: session.metadata?.contactEmail,
        institutionName: session.metadata?.institutionName,
        sessionId: session.id,
      });
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
