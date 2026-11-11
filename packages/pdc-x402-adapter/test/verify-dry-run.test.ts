import { describe, expect, it, beforeEach } from "vitest";
import { verifyAndSettleAlgorand } from "../src/schemes/algorand.js";
import { verifyAndSettleBase } from "../src/schemes/evm-base.js";
import { verifyAndSettleSolana } from "../src/schemes/solana.js";
import { verifyAndSettle } from "../src/index.js";
import type { AlgorandPaymentProof, EvmPaymentProof, SvmPaymentProof } from "../src/types.js";

// None of these tests set VITE_FLAG_LIVE_RPC_ACTIVE=true, so every call below
// takes the dry-run branch (no outbound RPC call, no network dependency).
beforeEach(() => {
  delete process.env.VITE_FLAG_LIVE_RPC_ACTIVE;
});

const ALGO_PROOF: AlgorandPaymentProof = { chain: "algorand", txId: "FAKE_TX_ID", network: "testnet" };
const EVM_PROOF: EvmPaymentProof = { chain: "base", txHash: "0xfake", chainId: 84532 };
const SVM_PROOF: SvmPaymentProof = { chain: "solana", signature: "fakeSignature", cluster: "devnet" };

describe("verifyAndSettleAlgorand (dry run)", () => {
  it("returns a mocked success result with the correct 97/3 split", async () => {
    const result = await verifyAndSettleAlgorand(ALGO_PROOF, 1);
    expect(result.success).toBe(true);
    expect(result.chain).toBe("algorand");
    expect(result.metadata?.dry_run).toBe(true);
    expect(result.providerAmountUsd).toBeCloseTo(0.97, 6);
    expect(result.sbpAmountUsd).toBeCloseTo(0.03, 6);
  });
});

describe("verifyAndSettleBase (dry run)", () => {
  it("returns a mocked success result without touching the network", async () => {
    const result = await verifyAndSettleBase(EVM_PROOF, 1);
    expect(result.success).toBe(true);
    expect(result.chain).toBe("base");
    expect(result.metadata?.dry_run).toBe(true);
  });
});

describe("verifyAndSettleSolana (dry run)", () => {
  it("returns a mocked success result without touching the network", async () => {
    const result = await verifyAndSettleSolana(SVM_PROOF, 1);
    expect(result.success).toBe(true);
    expect(result.chain).toBe("solana");
    expect(result.metadata?.dry_run).toBe(true);
  });
});

describe("verifyAndSettle (dispatcher)", () => {
  it("dispatches to the right chain's scheme by proof.chain", async () => {
    expect((await verifyAndSettle(ALGO_PROOF, 1)).chain).toBe("algorand");
    expect((await verifyAndSettle(EVM_PROOF, 1)).chain).toBe("base");
    expect((await verifyAndSettle(SVM_PROOF, 1)).chain).toBe("solana");
  });
});
