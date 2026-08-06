/** Shared client-side Algorand network/asset resolution (Session 13) —
 * used by both AlgorandWalletProvider (which network the wallet connects
 * to) and AgentRunForm (which USDC asset ID the payment transaction
 * transfers). Kept in one place so the two can't silently disagree. */
export type PacificClientNetwork = "mainnet" | "testnet";

/** Same two well-known USDC ASA IDs apps/agents/src/lib/wallet.ts already
 * uses server-side — duplicated here (not imported) because apps/web has
 * no dependency on apps/agents; the values themselves are network
 * constants, not something that drifts. */
const USDC_ASA_ID_BY_NETWORK: Record<PacificClientNetwork, number> = {
  mainnet: 31566704,
  testnet: 10458941,
};

/** Must match the agents service's own ALGORAND_NETWORK
 * (apps/agents/.env.example) — a mismatch here would build a payment
 * transaction for the wrong network's USDC asset, which the server-side
 * verifier would then correctly reject. */
export function resolvePacificNetwork(): PacificClientNetwork {
  return process.env.NEXT_PUBLIC_ALGORAND_NETWORK === "testnet" ? "testnet" : "mainnet";
}

export function usdcAssetId(): number {
  return USDC_ASA_ID_BY_NETWORK[resolvePacificNetwork()];
}
