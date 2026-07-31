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
 * Checks the agent operational wallet's USDC balance via algokit-utils'
 * AssetManager, so the service can refuse a live run early (with a clear
 * error) rather than let an unfunded wallet fail mid-payment. Point
 * `algodUrl` at the Nodely primary / AlgoNode failover per CLAUDE.md Section
 * 6 — this module takes no position on which node to use.
 *
 * Never throws: an unfunded or not-opted-in wallet is a valid (zero
 * balance, reported error) status, and an algod outage degrades the caller
 * to "balance unknown" rather than crashing the service.
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
