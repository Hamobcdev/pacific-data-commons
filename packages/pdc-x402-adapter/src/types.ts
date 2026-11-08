/**
 * Chain-agnostic payment-proof types for pdc-x402-adapter's multi-chain
 * verifyAndSettle() entry point (Base/Solana expansion, 2026-11-09).
 *
 * This is deliberately separate from PdcPaymentGate's existing @x402/hono
 * middleware + facilitator-settlement flow (schemes/algorand.ts), which is
 * unchanged by this file. verifyAndSettle() answers a different question —
 * "does this already-submitted on-chain transaction pay the expected USDC
 * amount to PDC's merchant address on this chain?" — a direct chain-RPC
 * check, not an x402 HTTP 402 challenge/response cycle. See
 * REFACTOR_NOTES.md (local, untracked) for why.
 */

export type PdcChain = "algorand" | "base" | "solana";

export interface AlgorandPaymentProof {
  chain: "algorand";
  txId: string;
  network: "mainnet" | "testnet";
}

export interface EvmPaymentProof {
  chain: "base";
  txHash: string;
  chainId: 8453 | 84532;
}

export interface SvmPaymentProof {
  chain: "solana";
  signature: string;
  cluster: "mainnet-beta" | "devnet";
}

export type PdcPaymentProof = AlgorandPaymentProof | EvmPaymentProof | SvmPaymentProof;

export interface PdcSettlementResult {
  success: boolean;
  chain: PdcChain;
  proof: PdcPaymentProof;
  /** 97% of the query fee (Decision 11/16: PDC-international 97/3 split). */
  providerAmountUsd: number;
  /** 3% of the query fee. */
  sbpAmountUsd: number;
  timestamp: string;
  /**
   * Not in the original interface sketch for this type — added because the
   * dry-run gate (VITE_FLAG_LIVE_RPC_ACTIVE=false) and failure reasons both
   * need somewhere to go without overloading success/providerAmountUsd/
   * sbpAmountUsd. Set `{ dry_run: true }` for a mocked result, or
   * `{ error: "<reason>" }` for a verification failure.
   */
  metadata?: Record<string, unknown>;
}

const SBP_FEE_SHARE = 0.03;
const USDC_ROUNDING_DECIMALS = 6;

function roundToUsdcPrecision(value: number): number {
  const factor = 10 ** USDC_ROUNDING_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * Decision 11/16: 97% provider / 3% SBP. Computes the SBP share first and
 * derives the provider share by subtraction (rather than rounding both
 * independently) so the two always sum exactly to the input amount.
 * Rounded to USDC's own 6-decimal precision, not 2 — PDC's per-query price
 * floor ($0.01) already produces sub-cent shares (e.g. $0.0003 SBP fee).
 */
export function splitProviderAndSbp(amountUsd: number): {
  providerAmountUsd: number;
  sbpAmountUsd: number;
} {
  const sbpAmountUsd = roundToUsdcPrecision(amountUsd * SBP_FEE_SHARE);
  const providerAmountUsd = roundToUsdcPrecision(amountUsd - sbpAmountUsd);
  return { providerAmountUsd, sbpAmountUsd };
}
