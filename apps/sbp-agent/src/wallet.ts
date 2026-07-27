import { getManualPaymentAddress } from "@pdc/x402-adapter";

const USDC_ASA_ID_BY_NETWORK = { mainnet: 31566704, testnet: 10458941 } as const;
const USDC_DECIMALS = 6;

export interface WalletStatus {
  /** Whether AGENT_WALLET_KEY is set at all. False means dry-run mode. */
  configured: boolean;
  address: string | null;
  /** Decimal USDC, or null if unconfigured or the balance check failed. */
  usdcBalanceUsdc: number | null;
  error: string | null;
}

interface AlgodAccountAsset {
  "asset-id": number;
  amount: number;
}

/**
 * Derives the agent wallet's address (via @pdc/x402-adapter — no direct
 * Algorand SDK import here) and checks its USDC balance against a public
 * Algod endpoint. Balance-checking itself is plain Algorand chain state, not
 * an x402 payment-protocol concern, so it's a simple REST call rather than
 * another adapter export — the "adapter-only" rule (R1) is specifically
 * about @x402/* packages.
 *
 * Never throws — a wallet or node problem degrades the agent to dry-run-like
 * behaviour with a logged reason, it doesn't crash startup.
 */
export async function getWalletStatus(params: {
  agentWalletKey: string | undefined;
  algorandNetwork: "mainnet" | "testnet";
  algorandNodeUrl: string;
}): Promise<WalletStatus> {
  if (!params.agentWalletKey) {
    return { configured: false, address: null, usdcBalanceUsdc: null, error: null };
  }

  let address: string;
  try {
    address = getManualPaymentAddress(params.agentWalletKey);
  } catch (err) {
    return {
      configured: true,
      address: null,
      usdcBalanceUsdc: null,
      error: `Invalid AGENT_WALLET_KEY: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const asaId = USDC_ASA_ID_BY_NETWORK[params.algorandNetwork];
  try {
    const res = await fetch(`${params.algorandNodeUrl}/v2/accounts/${address}`);
    if (!res.ok) {
      throw new Error(`algod returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as { assets?: AlgodAccountAsset[] };
    const asset = (body.assets ?? []).find((a) => a["asset-id"] === asaId);
    const usdcBalanceUsdc = asset ? asset.amount / 10 ** USDC_DECIMALS : 0;
    return { configured: true, address, usdcBalanceUsdc, error: null };
  } catch (err) {
    return {
      configured: true,
      address,
      usdcBalanceUsdc: null,
      error: `USDC balance check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
