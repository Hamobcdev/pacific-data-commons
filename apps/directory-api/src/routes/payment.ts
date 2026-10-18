import { Hono } from "hono";
import { logger } from "../lib/logger.js";
import { verifyAlgorandPayment } from "../lib/algorandIndexer.js";
import { sendDownloadTokenEmail } from "../lib/email.js";
import type { AppBindings } from "../types.js";

/**
 * Human payment rail (competition, simplified flow) — step 2 of 3.
 * POST /payment/verify: the buyer submits their reference_id + the
 * Algorand tx id they paid with; this verifies it against the indexer
 * and, on success, issues a one-time download token and emails it.
 *
 * Registered in app.ts BEFORE the x402 payment gate's middleware — this
 * route must be reachable with no x402 payment proof at all (see that
 * file's comment at the mount point for why registration order is what
 * makes that true in Hono's model).
 */
export const paymentRoutes = new Hono<AppBindings>();

const PENDING_STATES = new Set(["pending", "tx_submitted"]);

paymentRoutes.post("/payment/verify", async (c) => {
  const env = c.var.env;
  const supabase = c.var.supabase;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body." }, 400);
  }
  if (typeof body !== "object" || body === null) {
    return c.json({ error: "Invalid request body." }, 400);
  }

  const { referenceId, algoTxId } = body as Record<string, unknown>;
  if (typeof referenceId !== "string" || referenceId.trim().length === 0) {
    return c.json({ error: "referenceId is required." }, 400);
  }
  if (typeof algoTxId !== "string" || algoTxId.trim().length === 0) {
    return c.json({ error: "algoTxId is required." }, 400);
  }
  const trimmedReferenceId = referenceId.trim();
  const trimmedTxId = algoTxId.trim();

  const { data: intent, error: lookupError } = await supabase
    .from("payment_intents")
    .select("*")
    .eq("reference_id", trimmedReferenceId)
    .maybeSingle();

  if (lookupError) {
    logger.error("payment_verify_lookup_failed", { referenceId: trimmedReferenceId, error: lookupError.message });
    return c.json({ error: "Could not look up this payment." }, 500);
  }
  if (!intent) {
    return c.json({ error: "Reference ID not found." }, 404);
  }
  if (!PENDING_STATES.has(intent.state)) {
    return c.json({ error: "This payment has already been processed." }, 409);
  }
  if (new Date(intent.expires_at).getTime() < Date.now()) {
    return c.json({ error: "This payment reference has expired." }, 410);
  }

  const { error: markSubmittedError } = await supabase
    .from("payment_intents")
    .update({ state: "tx_submitted", algo_tx_id: trimmedTxId })
    .eq("id", intent.id);
  if (markSubmittedError) {
    logger.error("payment_verify_mark_submitted_failed", { referenceId: trimmedReferenceId, error: markSubmittedError.message });
    // Non-fatal — verification below still runs; this field is best-effort
    // audit trail, not a gate on issuing the token.
  }

  const expectedAmountMicroUsdc = BigInt(Math.round(Number(intent.amount_usdc) * 1_000_000));
  const verification = await verifyAlgorandPayment({
    txId: trimmedTxId,
    expectedPayTo: env.AVM_ADDRESS,
    expectedAmountMicroUsdc,
    indexerUrl: env.ALGORAND_INDEXER_URL,
  });

  if (!verification.valid) {
    logger.info("payment_verify_failed", { referenceId: trimmedReferenceId, algoTxId: trimmedTxId, reason: verification.error });
    return c.json({ error: "Payment not found or does not match expected amount/recipient" }, 400);
  }

  const downloadToken = crypto.randomUUID();
  const { error: issueTokenError } = await supabase
    .from("payment_intents")
    .update({
      state: "token_issued",
      download_token: downloadToken,
      buyer_wallet_address: verification.senderAddress ?? intent.buyer_wallet_address,
      token_issued_at: new Date().toISOString(),
    })
    .eq("id", intent.id);

  if (issueTokenError) {
    logger.error("payment_verify_issue_token_failed", { referenceId: trimmedReferenceId, error: issueTokenError.message });
    return c.json({ error: "Payment was verified but the download token could not be issued. Contact anthony@synergybcpacific.com with your reference ID." }, 500);
  }

  const emailSent = await sendDownloadTokenEmail(env, {
    buyerEmail: intent.buyer_email,
    downloadToken,
    referenceId: trimmedReferenceId,
    algoTxId: trimmedTxId,
  });
  if (!emailSent) {
    // Verification genuinely succeeded and the token genuinely exists —
    // logged loudly here (not surfaced as an error to the buyer) so an
    // operator can manually relay the link from payment_intents.download_token.
    logger.error("payment_verify_email_not_sent", { referenceId: trimmedReferenceId, buyerEmail: intent.buyer_email });
  }

  const downloadUrl = `https://pdc.synergybcpacific.com/en/data/download?token=${downloadToken}`;
  return c.json({ success: true, message: "Payment verified. Download link sent to your email.", download_url: downloadUrl });
});
