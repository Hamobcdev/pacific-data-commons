/**
 * pdc-x402-adapter
 *
 * The ONLY package in this monorepo allowed to import @x402/* packages, or
 * chain-specific payment-verification libraries (viem, @solana/kit,
 * algosdk) (CLAUDE.md Section 6 stack table + Section 17/18 "always via
 * pdc-x402-adapter" rule). Every app that needs to gate a route behind an
 * x402 payment, or verify an already-submitted payment proof directly,
 * goes through the exports below.
 *
 * Multi-chain generalization (2026-11-09, feature/multi-chain-adapter):
 * Algorand's existing PdcPaymentGate / @x402/hono middleware flow is
 * unchanged, moved verbatim into schemes/algorand.ts. verifyAndSettle()
 * below is a new, separate entry point — for Base and Solana, and for
 * Algorand too for parity — that verifies an already-submitted on-chain
 * transaction directly against the target chain's RPC, rather than
 * running the full x402 HTTP 402 challenge/response cycle PdcPaymentGate
 * uses. See REFACTOR_NOTES.md (local, untracked) for why the official
 * @x402/evm and @x402/svm packages exist but aren't used for this
 * particular entry point, and the open question that raises.
 */
import { verifyAndSettleAlgorand } from "./schemes/algorand.js";
import { verifyAndSettleBase } from "./schemes/evm-base.js";
import { verifyAndSettleSolana } from "./schemes/solana.js";
import type { PdcPaymentProof, PdcSettlementResult } from "./types.js";

export * from "./types.js";
export {
  installBazaarAjvWorkersLogFilter,
  type BazaarAjvWorkersLogFilterOptions,
} from "./bazaarAjvWorkersLogFilter.js";
export * from "./schemes/algorand.js";
export { verifyAndSettleBase } from "./schemes/evm-base.js";
export { verifyAndSettleSolana } from "./schemes/solana.js";

export const SUPPORTED_CHAINS = ["algorand", "base", "solana"] as const;

/**
 * Dispatches to the right chain's scheme based on `proof.chain`. The only
 * generic, chain-agnostic entry point this package exposes for the new
 * proof-based verification flow — callers that know their chain ahead of
 * time can import verifyAndSettleAlgorand/Base/Solana directly instead.
 */
export async function verifyAndSettle(
  proof: PdcPaymentProof,
  expectedAmountUsdc: number,
): Promise<PdcSettlementResult> {
  switch (proof.chain) {
    case "algorand":
      return verifyAndSettleAlgorand(proof, expectedAmountUsdc);
    case "base":
      return verifyAndSettleBase(proof, expectedAmountUsdc);
    case "solana":
      return verifyAndSettleSolana(proof, expectedAmountUsdc);
  }
}
