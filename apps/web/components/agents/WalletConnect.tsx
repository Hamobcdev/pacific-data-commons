"use client";

import { useState } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Connect/disconnect UI for the browser wallet that signs the user's quote
 * payment (Session 13). Deliberately just Pera + Lute — the two wallets
 * CLAUDE.md's onboarding wallet guide already recommends to providers
 * (components/wallet/WalletGuide.tsx), so a buyer running an agent sees the
 * same two options a provider setting up payouts already does.
 */
export function WalletConnect() {
  const { wallets, activeWallet, activeAddress } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  const handleConnect = async (walletId: string) => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) return;
    setError(null);
    setConnecting(walletId);
    try {
      await wallet.connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect wallet. Please try again.");
    } finally {
      setConnecting(null);
    }
  };

  if (activeAddress && activeWallet) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3">
        <div>
          <p className="text-sm font-medium text-navy">{activeWallet.metadata.name} connected</p>
          <p className="font-mono text-sm text-gray-500">{truncate(activeAddress)}</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => activeWallet.disconnect()}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-base font-medium text-gray-700">Connect your wallet to pay</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {wallets.map((wallet) => (
          <Button
            key={wallet.id}
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={connecting !== null}
            onClick={() => handleConnect(wallet.id)}
          >
            {connecting === wallet.id ? "Connecting…" : `Connect ${wallet.metadata.name}`}
          </Button>
        ))}
      </div>
      {error && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
