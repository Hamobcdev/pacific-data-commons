/**
 * On-chain payment verification for the human payment rail (competition,
 * simplified flow). Adapted from apps/agents/src/lib/paymentVerification.ts's
 * verifyOnChainPayment — same checks (confirmed, asset-transfer, USDC asset
 * id, receiver, amount) minus the note-field/quote_id match, which doesn't
 * apply here: this simplified flow has the user submit their reference id
 * separately via POST /payment/verify rather than relying on automated
 * note-matching. Deliberately NOT imported from apps/agents — that package
 * runs on Node (Render) and reaches the indexer via
 * @algorandfoundation/algokit-utils' AlgorandClient, which is unnecessary
 * weight here.
 *
 * This Worker's wrangler.toml does set `compatibility_flags =
 * ["nodejs_compat"]`, which might make algokit-utils/algosdk loadable, but
 * neither has ever been exercised in this Worker and algokit-utils pulls in
 * msgpack/transaction-building code this read-only lookup doesn't need —
 * not worth the bundle-size and cold-start risk to find out. A plain
 * fetch() against the indexer's public v2 REST API has zero dependencies
 * and is unambiguously Workers-compatible, so that's what this uses.
 */

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
