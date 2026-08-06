import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import type { PdcAlgorandNetwork } from "@pdc/x402-adapter";
import type { AgentQuote } from "./quoteStore.js";

const USDC_ASA_ID_BY_NETWORK: Record<PdcAlgorandNetwork, bigint> = {
  mainnet: 31566704n,
  testnet: 10458941n,
};
const USDC_DECIMALS = 6;

export interface PaymentVerificationResult {
  ok: boolean;
  reason?: string;
  algoTxId?: string;
}

function toAtomicUsdc(decimalUsdc: number): bigint {
  return BigInt(Math.round(decimalUsdc * 10 ** USDC_DECIMALS));
}

/**
 * Verifies a user's on-chain USDC payment against a specific quote (Session
 * 13 — the user-pays-agent leg; see quote.ts's doc comment for why this
 * isn't x402). Deliberately NOT the x402 protocol: every x402 client path
 * in this monorepo (pdc-x402-adapter's createManualPaymentFetch) signs with
 * a raw private key held server-side, which is fundamentally incompatible
 * with a real browser wallet extension (Pera/Lute never expose a raw key to
 * the page — they sign via their own connect API). Rather than guess at
 * whether @x402/avm's signer interface could be adapted to a wallet-connect
 * flow, the user's wallet signs a plain USDC asset-transfer transaction
 * (built client-side with algosdk, embedding the quote_id in the
 * transaction note for correlation) and this function is the server-side
 * check that the resulting transaction actually is what it claims to be
 * before the agent is allowed to execute.
 *
 * Checks, in order: transaction exists and is confirmed; it's a USDC
 * asset-transfer; the receiver is this quote's pay_to_address (the agent's
 * own operational wallet); the sender is this quote's user_wallet (a quote
 * generated for one wallet can't be redeemed by a different payer); the
 * amount matches the quoted total exactly; the note decodes to this exact
 * quote_id (prevents an unrelated payment, or a payment for a *different*
 * quote, from being replayed against this one).
 */
export async function verifyOnChainPayment(params: {
  txId: string;
  quote: AgentQuote;
  network: PdcAlgorandNetwork;
  algodUrl: string;
  indexerUrl: string;
}): Promise<PaymentVerificationResult> {
  const algorand = AlgorandClient.fromConfig({
    algodConfig: { server: params.algodUrl },
    indexerConfig: { server: params.indexerUrl },
  });

  let transaction;
  try {
    const response = await algorand.client.indexer.lookupTransactionById(params.txId);
    transaction = response.transaction;
  } catch (err) {
    return { ok: false, reason: `Transaction not found or indexer unavailable: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (!transaction.confirmedRound) {
    return { ok: false, reason: "Transaction is not yet confirmed." };
  }

  const transfer = transaction.assetTransferTransaction;
  if (!transfer) {
    return { ok: false, reason: "Transaction is not an asset transfer." };
  }

  const expectedAssetId = USDC_ASA_ID_BY_NETWORK[params.network];
  if (transfer.assetId !== expectedAssetId) {
    return { ok: false, reason: `Transaction transfers asset ${transfer.assetId}, not USDC (${expectedAssetId}).` };
  }

  if (transfer.receiver !== params.quote.pay_to_address) {
    return { ok: false, reason: "Transaction receiver does not match the agent's payment address for this quote." };
  }

  if (transaction.sender !== params.quote.user_wallet) {
    return { ok: false, reason: "Transaction sender does not match the wallet this quote was issued to." };
  }

  const expectedAtomicAmount = toAtomicUsdc(params.quote.total_usdc);
  if (transfer.amount !== expectedAtomicAmount) {
    return { ok: false, reason: `Transaction amount (${transfer.amount}) does not match the quoted total (${expectedAtomicAmount}).` };
  }

  const noteText = transaction.note ? new TextDecoder().decode(transaction.note) : "";
  if (noteText !== params.quote.quote_id) {
    return { ok: false, reason: "Transaction note does not match this quote_id." };
  }

  return { ok: true, algoTxId: params.txId };
}
