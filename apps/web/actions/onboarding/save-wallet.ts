"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { walletSchema } from "@/lib/onboarding/validation";

const USDC_MAINNET_ASA_ID = 31566704;

export interface WalletSaveResult {
  success: boolean;
  walletVerified: boolean;
  usdcOptedIn: boolean | null; // null if the node could not be reached
  error?: string;
}

interface AlgodAccount {
  assets?: Array<{ "asset-id": number }>;
}

/**
 * Validates and saves the provider's Algorand wallet address. Checks USDC
 * opt-in via a public Algod node — never blocks progress if the node is
 * unreachable (R5), just reports usdcOptedIn: null so the UI can say
 * "will verify manually" instead of failing the step.
 */
export async function saveWallet(
  providerId: string,
  walletAddress: string,
  hasInstitutionalAuthority: boolean,
): Promise<WalletSaveResult> {
  const parsed = walletSchema.safeParse({ walletAddress, hasInstitutionalAuthority });
  if (!parsed.success) {
    return { success: false, walletVerified: false, usdcOptedIn: null, error: parsed.error.issues[0]?.message };
  }

  let usdcOptedIn: boolean | null = null;
  try {
    const nodeUrl = process.env.ALGORAND_NODE_URL ?? "https://mainnet-api.algonode.cloud";
    const response = await fetch(`${nodeUrl}/v2/accounts/${walletAddress}`);
    if (response.ok) {
      const account = (await response.json()) as AlgodAccount;
      usdcOptedIn = (account.assets ?? []).some((a) => a["asset-id"] === USDC_MAINNET_ASA_ID);
    }
  } catch {
    usdcOptedIn = null; // node unreachable — do not block
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("providers")
    .update({
      wallet_address: walletAddress,
      usdc_opted_in: usdcOptedIn ?? false,
      wallet_verified_at: new Date().toISOString(),
      onboarding_status: "wallet_setup",
    })
    .eq("id", providerId);

  if (error) {
    return { success: false, walletVerified: false, usdcOptedIn, error: "Could not save wallet address. Please try again." };
  }

  return { success: true, walletVerified: true, usdcOptedIn };
}
