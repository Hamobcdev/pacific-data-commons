import { NextResponse } from "next/server";
import { getStripeClient, STRIPE_PRICE_IDS, type CheckoutPurpose } from "@/lib/stripe";
import { validateOnboardingSession, InvalidOnboardingSessionError } from "@/lib/onboarding/session";

interface CheckoutRequestBody {
  purpose: CheckoutPurpose;
  providerId?: string;
  sessionToken?: string;
  pdfSurcharge?: boolean;
  contactEmail?: string;
  institutionName?: string;
}

function isCheckoutPurpose(value: unknown): value is CheckoutPurpose {
  return value === "upload_fee" || value === "deployment_standard" || value === "deployment_complex";
}

/**
 * Session 23 (Deliverable 4) — creates a Stripe Checkout Session for the
 * "pay by card" option alongside upload_payments' USDC/invoice paths
 * (UploadPaymentGate.tsx) and for deployment service fees (CLAUDE.md §7
 * Node Deployment Service table). Same error posture as
 * app/api/assistant/route.ts: never leak the raw Stripe error, 503 when
 * Stripe isn't configured rather than a 500 crash.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => undefined)) as CheckoutRequestBody | undefined;
  if (!body || !isCheckoutPurpose(body.purpose)) {
    return NextResponse.json({ error: "invalid_request", message: "purpose must be one of: upload_fee, deployment_standard, deployment_complex." }, { status: 400 });
  }

  let priceId: string | undefined;
  let metadata: Record<string, string> = { purpose: body.purpose };

  if (body.purpose === "upload_fee") {
    if (!body.providerId || !body.sessionToken) {
      return NextResponse.json({ error: "invalid_request", message: "providerId and sessionToken are required for upload_fee." }, { status: 400 });
    }
    try {
      await validateOnboardingSession(body.providerId, body.sessionToken);
    } catch (err) {
      return NextResponse.json(
        { error: "invalid_session", message: err instanceof InvalidOnboardingSessionError ? err.message : "Invalid session." },
        { status: 401 },
      );
    }
    priceId = STRIPE_PRICE_IDS.uploadFee;
    metadata = { ...metadata, providerId: body.providerId, datasetSlot: body.sessionToken, pdfSurcharge: String(body.pdfSurcharge === true) };
  } else {
    const contactEmail = body.contactEmail?.trim();
    if (!contactEmail) {
      return NextResponse.json({ error: "invalid_request", message: "contactEmail is required for deployment service checkout." }, { status: 400 });
    }
    priceId = body.purpose === "deployment_standard" ? STRIPE_PRICE_IDS.deploymentStandard : STRIPE_PRICE_IDS.deploymentComplex;
    metadata = { ...metadata, contactEmail, institutionName: body.institutionName?.trim() ?? "" };
  }

  if (!priceId) {
    return NextResponse.json({ error: "checkout_unavailable", message: "This payment option is not yet configured." }, { status: 503 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const lineItems = [{ price: priceId, quantity: 1 }];
  if (body.purpose === "upload_fee" && body.pdfSurcharge && STRIPE_PRICE_IDS.scannedPdfSurcharge) {
    lineItems.push({ price: STRIPE_PRICE_IDS.scannedPdfSurcharge, quantity: 1 });
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      metadata,
      success_url: `${appUrl}/onboarding/upload?stripe=success`,
      cancel_url: `${appUrl}/onboarding/upload?stripe=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "checkout_unavailable", message: "Could not start checkout. Please try again." }, { status: 503 });
    }

    return NextResponse.json({ checkoutUrl: session.url }, { status: 200 });
  } catch (err) {
    console.error("Stripe checkout session creation failed:", body.purpose, err);
    return NextResponse.json({ error: "checkout_unavailable", message: "Could not start checkout. Please try again." }, { status: 503 });
  }
}
