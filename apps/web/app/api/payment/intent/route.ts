import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidAddressFormat } from "@/lib/algorand/validate";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Step 1 of the human payment rail (competition, simplified flow): captures
 * a buyer's email + optional wallet address before the QR is shown, and
 * creates the payment_intents row (state 'pending') that
 * POST /payment/verify (apps/directory-api) later looks up by reference_id.
 *
 * referenceId is generated here, not client-side — it's what gets embedded
 * in the Pera Wallet deeplink's note field, so the server (the only party
 * that writes payment_intents) must be the one that mints it.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { endpointId, tierPath, amountUsdc, email, walletAddress, purpose } = body as Record<string, unknown>;

  // Phase C (Tourism Data Framework) — registration-fee intents have no
  // endpoint (they pay for a provider listing, not a data query). Every
  // other/existing caller omits `purpose`, which defaults to the original
  // behaviour below unchanged.
  const trimmedPurpose = typeof purpose === "string" && purpose.trim().length > 0 ? purpose.trim() : "endpoint_query";
  if (trimmedPurpose !== "endpoint_query" && trimmedPurpose !== "registration_fee") {
    return NextResponse.json({ error: "purpose must be one of: endpoint_query, registration_fee." }, { status: 400 });
  }

  if (trimmedPurpose !== "registration_fee" && (typeof endpointId !== "string" || endpointId.trim().length === 0)) {
    return NextResponse.json({ error: "endpointId is required." }, { status: 400 });
  }
  if (typeof tierPath !== "string" || !tierPath.startsWith("/")) {
    return NextResponse.json({ error: "tierPath is required." }, { status: 400 });
  }
  if (typeof amountUsdc !== "number" || !Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    return NextResponse.json({ error: "amountUsdc must be a positive number." }, { status: 400 });
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  let trimmedWalletAddress: string | null = null;
  if (walletAddress !== undefined) {
    if (typeof walletAddress !== "string" || (walletAddress.trim() && !isValidAddressFormat(walletAddress.trim()))) {
      return NextResponse.json({ error: "walletAddress is not a valid Algorand address." }, { status: 400 });
    }
    trimmedWalletAddress = walletAddress.trim() || null;
  }

  const referenceId = `PDC-${randomUUID()}`;

  const supabase = createServiceClient();
  const { error } = await supabase.from("payment_intents").insert({
    reference_id: referenceId,
    endpoint_id: trimmedPurpose === "registration_fee" ? null : (endpointId as string).trim(),
    tier_path: tierPath,
    amount_usdc: amountUsdc,
    buyer_email: email.trim(),
    buyer_wallet_address: trimmedWalletAddress,
    state: "pending",
    purpose: trimmedPurpose,
  });

  if (error) {
    console.error("[payment/intent] Supabase insert error:", error);
    return NextResponse.json({ error: "Could not create payment intent." }, { status: 500 });
  }

  return NextResponse.json({ referenceId, payToAddress: process.env.AVM_ADDRESS ?? null });
}
