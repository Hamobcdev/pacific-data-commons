/**
 * Base (EVM) scheme for pdc-x402-adapter — multi-chain expansion,
 * 2026-11-09.
 *
 * Uses viem directly rather than the official @x402/evm package. @x402/evm
 * exists (confirmed on npm, Coinbase/x402-foundation maintained, v2.30.0)
 * but its public API (ExactEvmScheme, registerExactEvmScheme) is built for
 * the x402 resource-server/facilitator-client HTTP 402 challenge/response
 * cycle — the same architecture PdcPaymentGate already uses for Algorand —
 * not for verifying a bare already-submitted txHash handed to it after the
 * fact, which is what EvmPaymentProof represents. See REFACTOR_NOTES.md
 * (local, untracked) for the full reasoning and the open question this
 * raises for Anthony.
 */
import { createPublicClient, http, decodeEventLog, erc20Abi, type Address } from "viem";
import { base, baseSepolia } from "viem/chains";
import type { EvmPaymentProof, PdcSettlementResult } from "../types.js";
import { splitProviderAndSbp } from "../types.js";

/**
 * USDC on Base — Circle's official addresses (confirmed against Circle's
 * own announcement, not just a search aggregator; both are valid 42-char
 * 0x addresses — a prior audit flagged the Sepolia one as malformed from a
 * manual character count that was simply wrong).
 */
const USDC_ADDRESS_BY_CHAIN_ID: Record<8453 | 84532, Address> = {
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

const VIEM_CHAIN_BY_ID = {
  8453: base,
  84532: baseSepolia,
} as const;

const USDC_DECIMALS_BASE = 6;

function baseFailureResult(proof: EvmPaymentProof, timestamp: string, error: string): PdcSettlementResult {
  return { success: false, chain: "base", proof, providerAmountUsd: 0, sbpAmountUsd: 0, timestamp, metadata: { error } };
}

/**
 * Verifies that `proof.txHash` is a confirmed Base transaction carrying a
 * USDC transfer of at least `expectedAmountUsdc` to PDC_BASE_MERCHANT_ADDRESS.
 *
 * Gated on VITE_FLAG_LIVE_RPC_ACTIVE=false (always false in committed code
 * per this refactor's constraints) — when not exactly "true", returns a
 * mock success result with `metadata: { dry_run: true }` instead of making
 * any outbound RPC call.
 */
export async function verifyAndSettleBase(
  proof: EvmPaymentProof,
  expectedAmountUsdc: number,
): Promise<PdcSettlementResult> {
  const timestamp = new Date().toISOString();

  if (process.env.VITE_FLAG_LIVE_RPC_ACTIVE !== "true") {
    const { providerAmountUsd, sbpAmountUsd } = splitProviderAndSbp(expectedAmountUsdc);
    return { success: true, chain: "base", proof, providerAmountUsd, sbpAmountUsd, timestamp, metadata: { dry_run: true } };
  }

  const merchantAddress = process.env.PDC_BASE_MERCHANT_ADDRESS;
  if (!merchantAddress) {
    throw new Error("PDC_BASE_MERCHANT_ADDRESS is not set");
  }

  const chain = VIEM_CHAIN_BY_ID[proof.chainId];
  // http(undefined) falls back to the chain's own default public RPC
  // (e.g. https://mainnet.base.org) — PDC_BASE_RPC_URL is optional, for a
  // dedicated RPC provider instead of the shared public endpoint.
  const client = createPublicClient({ chain, transport: http(process.env.PDC_BASE_RPC_URL) });

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: proof.txHash as `0x${string}` });
  } catch (error) {
    return baseFailureResult(proof, timestamp, `base_receipt_lookup_failed: ${(error as Error).message}`);
  }

  if (receipt.status !== "success") {
    return baseFailureResult(proof, timestamp, "transaction_reverted");
  }

  const usdcAddress = USDC_ADDRESS_BY_CHAIN_ID[proof.chainId];
  const expectedAtomic = BigInt(Math.round(expectedAmountUsdc * 10 ** USDC_DECIMALS_BASE));
  const merchantAddressLower = merchantAddress.toLowerCase();

  const matchingTransfer = receipt.logs
    .filter((log) => log.address.toLowerCase() === usdcAddress.toLowerCase())
    .map((log) => {
      try {
        return decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics, eventName: "Transfer" });
      } catch {
        return undefined;
      }
    })
    .find((event) => event !== undefined && event.args.to.toLowerCase() === merchantAddressLower && event.args.value >= expectedAtomic);

  if (!matchingTransfer) {
    return baseFailureResult(proof, timestamp, "no_matching_usdc_transfer");
  }

  const { providerAmountUsd, sbpAmountUsd } = splitProviderAndSbp(expectedAmountUsdc);
  return { success: true, chain: "base", proof, providerAmountUsd, sbpAmountUsd, timestamp };
}
