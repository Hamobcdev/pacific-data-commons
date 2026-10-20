import { Hono } from "hono";
import { logger } from "../lib/logger.js";
import { verifyAlgorandPayment, searchPaymentByNote } from "../lib/algorandIndexer.js";
import { sendDownloadTokenEmail } from "../lib/email.js";
import { rateLimit } from "../middleware/rateLimit.js";
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

  // Replay guard (feature/payment-modal-auto-txid) — a txId that already
  // redeemed a DIFFERENT intent must be rejected before it ever reaches the
  // indexer. algo_tx_id has no DB-level UNIQUE constraint prior to this fix
  // (see supabase/migrations/20261020000002_add_algo_tx_id_unique_constraint.sql),
  // and verifyAlgorandPayment below only checks that a txId resolves to a
  // valid matching on-chain transfer — it has no concept of "already
  // consumed by another intent," so a real transaction once used to
  // redeem Intent A would otherwise also verify successfully for any other
  // pending Intent B with the same amount/receiver. Checked fail-fast here,
  // before the indexer round-trip, not after.
  const { data: duplicateTxRows, error: duplicateTxLookupError } = await supabase
    .from("payment_intents")
    .select("id")
    .eq("algo_tx_id", trimmedTxId)
    .neq("id", intent.id);
  if (duplicateTxLookupError) {
    logger.error("payment_verify_duplicate_tx_lookup_failed", { referenceId: trimmedReferenceId, error: duplicateTxLookupError.message });
    return c.json({ error: "Could not verify this payment. Please try again." }, 500);
  }
  if (duplicateTxRows && duplicateTxRows.length > 0) {
    logger.info("payment_verify_duplicate_tx_rejected", {
      referenceId: trimmedReferenceId,
      algoTxId: trimmedTxId,
      conflictingIntentIds: duplicateTxRows.map((r) => r.id),
    });
    return c.json({ error: "transaction_already_used" }, 409);
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

/**
 * Human payment rail — on-demand indexer search (feature/payment-modal-auto-txid).
 * POST /payment/search: given a referenceId, looks for a confirmed USDC
 * transfer on-chain whose note matches it (via searchPaymentByNote), so
 * apps/web's PaymentModal can auto-populate algoTxId instead of requiring
 * the user to paste it. Read-only: never writes to Supabase, never issues
 * a download token, never sends email — POST /payment/verify above (called
 * separately, unchanged) still owns all of that. Triggered by a single
 * user button click per apps/web's handleSearchPayment, not a poll loop;
 * the 10/min/IP limit below exists in case of retries or misbehaving
 * clients, not because this is expected to be called frequently.
 */
const searchRateLimit = rateLimit({ windowMs: 60_000, max: 10 });

paymentRoutes.post("/payment/search", searchRateLimit, async (c) => {
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

  const { referenceId } = body as Record<string, unknown>;
  if (typeof referenceId !== "string" || referenceId.trim().length === 0) {
    return c.json({ error: "referenceId is required." }, 400);
  }
  const trimmedReferenceId = referenceId.trim();

  const { data: intent, error: lookupError } = await supabase
    .from("payment_intents")
    .select("*")
    .eq("reference_id", trimmedReferenceId)
    .maybeSingle();

  if (lookupError) {
    logger.error("payment_search_lookup_failed", { referenceId: trimmedReferenceId, error: lookupError.message });
    return c.json({ error: "Could not look up this payment." }, 500);
  }
  if (!intent) {
    return c.json({ error: "Reference ID not found." }, 404);
  }
  // Same PENDING_STATES allow-list as POST /payment/verify above — once an
  // intent has moved to token_issued or token_redeemed, searching again is
  // pointless (and, for token_redeemed, the download has already gone out).
  if (!PENDING_STATES.has(intent.state)) {
    return c.json({ error: "This payment has already been processed." }, 409);
  }
  if (new Date(intent.expires_at).getTime() < Date.now()) {
    return c.json({ error: "This payment reference has expired." }, 410);
  }

  const expectedAmountMicroUsdc = BigInt(Math.round(Number(intent.amount_usdc) * 1_000_000));
  const result = await searchPaymentByNote({
    referenceId: trimmedReferenceId,
    expectedPayTo: env.AVM_ADDRESS,
    expectedAmountMicroUsdc,
    indexerUrl: env.ALGORAND_INDEXER_URL,
  });

  if (!result) {
    return c.json({ found: false });
  }
  return c.json({ found: true, txId: result.txId });
});
