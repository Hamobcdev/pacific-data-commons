/**
 * On-chain payment verification for the human payment rail (competition,
 * simplified flow). Adapted from apps/agents/src/lib/paymentVerification.ts's
 * verifyOnChainPayment — same checks (confirmed, asset-transfer, USDC asset
 * id, receiver, amount) minus the note-field/quote_id match, which didn't
 * apply when this file only had verifyAlgorandPayment: that flow had the
 * user submit their reference id separately via POST /payment/verify
 * rather than relying on automated note-matching. searchPaymentByNote below
 * (feature/payment-modal-auto-txid) adds that note-matching back, as a
 * separate on-demand search rather than a change to verifyAlgorandPayment
 * itself — see that function's own doc comment. Deliberately NOT imported
 * from apps/agents — that package runs on Node (Render) and reaches the
 * indexer via @algorandfoundation/algokit-utils' AlgorandClient, which is
 * unnecessary weight here.
 *
 * This Worker's wrangler.toml does set `compatibility_flags =
 * ["nodejs_compat"]`, which might make algokit-utils/algosdk loadable, but
 * neither has ever been exercised in this Worker and algokit-utils pulls in
 * msgpack/transaction-building code this read-only lookup doesn't need —
 * not worth the bundle-size and cold-start risk to find out. A plain
 * fetch() against the indexer's public v2 REST API has zero dependencies
 * and is unambiguously Workers-compatible, so that's what this uses.
 */

import { logger } from "./logger.js";

/** USDC on Algorand Mainnet (CLAUDE.md Section 6 — Blockchain: Algorand Mainnet). Same constant as apps/agents' USDC_ASA_ID_BY_NETWORK.mainnet and apps/web's PaymentModal.tsx. This flow is Mainnet-only — every SIFA/invest endpoint this rail serves is already live on Mainnet. */
const USDC_ASSET_ID_MAINNET = 31566704;

export interface AlgorandPaymentVerificationResult {
  valid: boolean;
  senderAddress?: string;
  error?: string;
}

/**
 * Indexer v2 REST API's transaction shape (only the fields this check
 * reads) — field names are the real wire format (kebab-case JSON keys),
 * not algosdk's camelCase SDK types.
 */
interface IndexerTransactionResponse {
  transaction?: {
    "confirmed-round"?: number;
    "tx-type"?: string;
    sender?: string;
    "asset-transfer-transaction"?: {
      "asset-id"?: number;
      amount?: number;
      receiver?: string;
    };
  };
  message?: string;
}

export async function verifyAlgorandPayment(params: {
  txId: string;
  expectedPayTo: string;
  expectedAmountMicroUsdc: bigint;
  indexerUrl: string;
}): Promise<AlgorandPaymentVerificationResult> {
  const url = `${params.indexerUrl.replace(/\/$/, "")}/v2/transactions/${encodeURIComponent(params.txId)}`;

  let body: IndexerTransactionResponse;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null) as { message?: string } | null;
      return { valid: false, error: `Transaction not found: ${errBody?.message ?? `indexer returned ${res.status}`}` };
    }
    body = (await res.json()) as IndexerTransactionResponse;
  } catch (err) {
    return { valid: false, error: `Indexer unavailable: ${err instanceof Error ? err.message : String(err)}` };
  }

  const transaction = body.transaction;
  if (!transaction) {
    return { valid: false, error: "Transaction not found." };
  }

  if (!transaction["confirmed-round"]) {
    return { valid: false, error: "Transaction is not yet confirmed." };
  }

  if (transaction["tx-type"] !== "axfer") {
    return { valid: false, error: "Transaction is not an asset transfer." };
  }

  const transfer = transaction["asset-transfer-transaction"];
  if (!transfer) {
    return { valid: false, error: "Transaction is not an asset transfer." };
  }

  if (transfer["asset-id"] !== USDC_ASSET_ID_MAINNET) {
    return { valid: false, error: `Transaction transfers asset ${transfer["asset-id"]}, not USDC (${USDC_ASSET_ID_MAINNET}).` };
  }

  const receiver = transfer.receiver?.trim().toUpperCase();
  const expectedReceiver = params.expectedPayTo.trim().toUpperCase();
  if (receiver !== expectedReceiver) {
    return { valid: false, error: "Transaction receiver does not match the expected payment address." };
  }

  if (typeof transfer.amount !== "number") {
    return { valid: false, error: "Transaction has no transfer amount." };
  }
  const actualAmount = BigInt(transfer.amount);
  if (actualAmount !== params.expectedAmountMicroUsdc) {
    return { valid: false, error: `Transaction amount (${actualAmount}) does not match the expected amount (${params.expectedAmountMicroUsdc}).` };
  }

  return { valid: true, senderAddress: transaction.sender };
}

export interface PaymentSearchResult {
  txId: string;
}

/**
 * Indexer v2 REST API's /v2/transactions SEARCH response shape (distinct
 * from the single-transaction GET shape above — search results are a flat
 * array of transaction objects, each with the fields read below).
 */
interface IndexerSearchResponse {
  transactions?: Array<{
    id?: string;
    "confirmed-round"?: number;
    "tx-type"?: string;
    "asset-transfer-transaction"?: {
      "asset-id"?: number;
      amount?: number;
      receiver?: string;
    };
  }>;
}

/**
 * On-demand indexer search for the human payment rail's auto-detect flow
 * (feature/payment-modal-auto-txid) — called from POST /payment/search,
 * triggered by a single user button click, NOT a polling loop. Looks for a
 * confirmed USDC transfer to expectedPayTo whose on-chain note starts with
 * the base64 encoding of referenceId.
 *
 * Matches apps/web/components/PaymentModal.tsx's ARC-26 xnote construction:
 * xnote is itself base64 (ARC-26 spec), and a wallet decodes it back to raw
 * bytes before writing the transaction note — so the raw on-chain note
 * bytes equal the UTF-8 bytes of referenceId, not a base64 string. The
 * indexer's own note-prefix param expects a base64-encoded value to
 * compare against those raw note bytes, so re-encoding referenceId the
 * same way here (not re-encoding the already-base64 xnote value) produces
 * the correct prefix to search for.
 *
 * Deliberately does NOT reuse verifyAlgorandPayment or get called from
 * POST /payment/verify — this is an additive, separate lookup path so the
 * existing confirm flow's behaviour is untouched.
 *
 * Never throws: any indexer error (network failure, non-2xx, malformed
 * body) or an ambiguous multiple-match result returns null, which the
 * caller (POST /payment/search) turns into { found: false } rather than
 * guessing at a txId.
 */
export async function searchPaymentByNote(params: {
  referenceId: string;
  expectedPayTo: string;
  expectedAmountMicroUsdc: bigint;
  indexerUrl: string;
}): Promise<PaymentSearchResult | null> {
  try {
    const notePrefix = Buffer.from(params.referenceId, "utf-8").toString("base64");

    const url = new URL(`${params.indexerUrl.replace(/\/$/, "")}/v2/transactions`);
    url.searchParams.set("address", params.expectedPayTo);
    url.searchParams.set("address-role", "receiver");
    url.searchParams.set("asset-id", String(USDC_ASSET_ID_MAINNET));
    url.searchParams.set("note-prefix", notePrefix);
    url.searchParams.set("limit", "5");

    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as IndexerSearchResponse;

    const expectedReceiver = params.expectedPayTo.trim().toUpperCase();
    const matches = (body.transactions ?? []).filter((tx) => {
      if (tx["tx-type"] !== "axfer") return false;
      if (!tx["confirmed-round"]) return false;
      const transfer = tx["asset-transfer-transaction"];
      if (!transfer) return false;
      if (transfer["asset-id"] !== USDC_ASSET_ID_MAINNET) return false;
      if (transfer.receiver?.trim().toUpperCase() !== expectedReceiver) return false;
      if (typeof transfer.amount !== "number") return false;
      if (BigInt(transfer.amount) !== params.expectedAmountMicroUsdc) return false;
      return typeof tx.id === "string" && tx.id.length > 0;
    });

    if (matches.length === 0) {
      return null;
    }
    if (matches.length > 1) {
      // Collision guard — do not guess which match is the real one.
      logger.warn("payment_search_multiple_matches", {
        referenceId: params.referenceId,
        matchCount: matches.length,
        txIds: matches.map((m) => m.id),
      });
      return null;
    }

    return { txId: matches[0]!.id! };
  } catch {
    return null;
  }
}
