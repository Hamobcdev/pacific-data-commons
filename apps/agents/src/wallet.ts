import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import type { PdcAlgorandNetwork } from "@pdc/x402-adapter";

const USDC_ASA_ID_BY_NETWORK: Record<PdcAlgorandNetwork, bigint> = {
  mainnet: 31566704n,
  testnet: 10458941n,
};
const USDC_DECIMALS = 6;

export interface OperationalWalletBalance {
  address: string;
  /** Decimal USDC, or 0 if the balance check failed (see `error`). */
  usdcBalance: number;
  error: string | null;
}

/**
 * Checks a PDC agent's operational wallet USDC balance via algokit-utils'
 * AssetManager, so an agent can decide it has enough funds before running a
 * query cycle rather than discovering a payment failure mid-cycle. Point
 * `algodUrl` at the Nodely primary / AlgoNode failover per CLAUDE.md Section
 * 6 — this module takes no position on which node to use.
 *
 * Never throws: an unfunded or not-opted-in wallet is a valid (zero
 * balance, reported error) status, and an algod outage degrades the caller
 * to "balance unknown" rather than crashing the agent.
 */
export async function getUsdcBalance(params: {
  address: string;
  network: PdcAlgorandNetwork;
  algodUrl: string;
}): Promise<OperationalWalletBalance> {
  try {
    const algorand = AlgorandClient.fromConfig({ algodConfig: { server: params.algodUrl } });
    const assetId = USDC_ASA_ID_BY_NETWORK[params.network];
    const info = await algorand.asset.getAccountInformation(params.address, assetId);
    return { address: params.address, usdcBalance: Number(info.balance) / 10 ** USDC_DECIMALS, error: null };
  } catch (err) {
    return {
      address: params.address,
      usdcBalance: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
