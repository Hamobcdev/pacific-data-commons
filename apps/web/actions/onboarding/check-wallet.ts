"use server";

import { checkAddressFormat } from "@/lib/algorand/validate";

const USDC_MAINNET_ASA_ID = 31566704;

export interface WalletCheckResult {
  formatValid: boolean;
  /** null = could not reach the node — never blocks progress (R5). */
  usdcOptedIn: boolean | null;
}

interface AlgodAccount {
  assets?: Array<{ "asset-id": number }>;
}

/**
 * Read-only, no-DB-write live check for WalletInput's real-time feedback —
 * deliberately separate from save-wallet.ts, which persists the address and
 * requires the institutional-authority confirmation first. This lets the
 * address field show "USDC enabled" as the provider types, before they've
 * necessarily reached the authority checkbox yet.
 */
export async function checkWalletAddress(address: string): Promise<WalletCheckResult> {
  const format = checkAddressFormat(address);
  if (!format.valid) {
    return { formatValid: false, usdcOptedIn: null };
  }

  try {
    const nodeUrl = process.env.ALGORAND_NODE_URL ?? "https://mainnet-api.algonode.cloud";
    const response = await fetch(`${nodeUrl}/v2/accounts/${address.trim()}`);
    if (!response.ok) {
      return { formatValid: true, usdcOptedIn: null };
    }
    const account = (await response.json()) as AlgodAccount;
    const usdcOptedIn = (account.assets ?? []).some((a) => a["asset-id"] === USDC_MAINNET_ASA_ID);
    return { formatValid: true, usdcOptedIn };
  } catch {
    return { formatValid: true, usdcOptedIn: null };
  }
}
