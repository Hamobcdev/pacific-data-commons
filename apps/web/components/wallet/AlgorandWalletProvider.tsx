"use client";

import { useMemo } from "react";
import { WalletManager, WalletId, NetworkId } from "@txnlab/use-wallet";
import { WalletProvider } from "@txnlab/use-wallet-react";
import { resolvePacificNetwork } from "@/lib/agents/algorand";

/**
 * Browser wallet connection for the user-pays-agent flow (Session 13).
 * Scoped to the agent run form specifically, not the app root — this pulls
 * in wallet-adapter bundles (Pera + Lute) that most visitors browsing the
 * directory or onboarding never need, and P8 (Pacific connectivity) says
 * page weight matters everywhere it isn't required.
 *
 * NEXT_PUBLIC_ALGORAND_NETWORK controls which network the connected wallet
 * targets — must match the agents service's own ALGORAND_NETWORK
 * (apps/agents/.env.example) or a real payment would verify against the
 * wrong network's USDC asset ID.
 */
export function AlgorandWalletProvider({ children }: { children: React.ReactNode }) {
  const manager = useMemo(
    () =>
      new WalletManager({
        wallets: [WalletId.PERA, WalletId.LUTE],
        defaultNetwork: resolvePacificNetwork() === "testnet" ? NetworkId.TESTNET : NetworkId.MAINNET,
      }),
    [],
  );

  return <WalletProvider manager={manager}>{children}</WalletProvider>;
}
