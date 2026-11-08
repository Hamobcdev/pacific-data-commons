/**
 * Solana (SVM) scheme for pdc-x402-adapter — multi-chain expansion,
 * 2026-11-09.
 *
 * Uses @solana/kit directly rather than the official @x402/svm package
 * (not @x402/solana — that name doesn't exist on npm; @x402/svm is the
 * real one, confirmed, Coinbase/x402-foundation maintained, v2.30.0).
 * Same reasoning as schemes/evm-base.ts: @x402/svm's public API is built
 * for the x402 resource-server/facilitator-client HTTP 402 challenge/
 * response cycle, not for verifying a bare already-submitted signature
 * handed to it after the fact. See REFACTOR_NOTES.md (local, untracked).
 *
 * The Solana x402 mechanism itself differs from EVM's anyway (partially-
 * signed transactions rather than EIP-712/EIP-3009 signatures) — another
 * reason @x402/svm's client/server scheme classes don't map cleanly onto
 * a standalone "verify this signature" check.
 */
import { createSolanaRpc, address, signature as toSignature } from "@solana/kit";
import type { SvmPaymentProof, PdcSettlementResult } from "../types.js";
import { splitProviderAndSbp } from "../types.js";

/** Circle's official USDC mint on Solana mainnet. */
const USDC_MINT_SOLANA = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const RPC_URL_BY_CLUSTER: Record<"mainnet-beta" | "devnet", string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
};

function solanaFailureResult(proof: SvmPaymentProof, timestamp: string, error: string): PdcSettlementResult {
  return { success: false, chain: "solana", proof, providerAmountUsd: 0, sbpAmountUsd: 0, timestamp, metadata: { error } };
}

/**
 * Verifies that `proof.signature` is a confirmed Solana transaction whose
 * token balance changes show at least `expectedAmountUsdc` of USDC landing
 * in a token account owned by PDC_SOLANA_MERCHANT_ADDRESS.
 *
 * Gated on VITE_FLAG_LIVE_RPC_ACTIVE=false (always false in committed code
 * per this refactor's constraints) — when not exactly "true", returns a
 * mock success result with `metadata: { dry_run: true }` instead of making
 * any outbound RPC call.
 */
export async function verifyAndSettleSolana(
  proof: SvmPaymentProof,
  expectedAmountUsdc: number,
): Promise<PdcSettlementResult> {
  const timestamp = new Date().toISOString();

  if (process.env.VITE_FLAG_LIVE_RPC_ACTIVE !== "true") {
    const { providerAmountUsd, sbpAmountUsd } = splitProviderAndSbp(expectedAmountUsdc);
    return { success: true, chain: "solana", proof, providerAmountUsd, sbpAmountUsd, timestamp, metadata: { dry_run: true } };
  }

  const merchantAddress = process.env.PDC_SOLANA_MERCHANT_ADDRESS;
  if (!merchantAddress) {
    throw new Error("PDC_SOLANA_MERCHANT_ADDRESS is not set");
  }

  const rpcUrl = process.env.PDC_SOLANA_RPC_URL ?? RPC_URL_BY_CLUSTER[proof.cluster];
  const rpc = createSolanaRpc(rpcUrl);

  let tx;
  try {
    tx = await rpc
      .getTransaction(toSignature(proof.signature), { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 })
      .send();
  } catch (error) {
    return solanaFailureResult(proof, timestamp, `solana_lookup_failed: ${(error as Error).message}`);
  }

  if (!tx || !tx.meta || tx.meta.err) {
    return solanaFailureResult(proof, timestamp, "transaction_not_found_or_failed");
  }

  const usdcMint = address(USDC_MINT_SOLANA);
  const merchantOwner = address(merchantAddress);

  const postBalance = (tx.meta.postTokenBalances ?? []).find(
    (balance) => balance.mint === usdcMint && balance.owner === merchantOwner,
  );
  if (!postBalance) {
    return solanaFailureResult(proof, timestamp, "no_matching_usdc_balance_change");
  }

  const priorBalance = (tx.meta.preTokenBalances ?? []).find(
    (balance) => balance.accountIndex === postBalance.accountIndex,
  );

  const postAmount = Number(postBalance.uiTokenAmount.uiAmountString ?? postBalance.uiTokenAmount.uiAmount ?? 0);
  const priorAmount = Number(priorBalance?.uiTokenAmount.uiAmountString ?? priorBalance?.uiTokenAmount.uiAmount ?? 0);
  const receivedUsdc = postAmount - priorAmount;

  if (receivedUsdc < expectedAmountUsdc) {
    return solanaFailureResult(proof, timestamp, "amount_too_low");
  }

  const { providerAmountUsd, sbpAmountUsd } = splitProviderAndSbp(expectedAmountUsdc);
  return { success: true, chain: "solana", proof, providerAmountUsd, sbpAmountUsd, timestamp };
}
