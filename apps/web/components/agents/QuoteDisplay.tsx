"use client";

import { useEffect, useState } from "react";
import type { AgentQuote } from "@pdc/shared-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WalletConnect } from "./WalletConnect";

function secondsUntil(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function QuoteDisplay({
  quote,
  walletConnected,
  onPay,
  onExpired,
  isPaying,
}: {
  quote: AgentQuote;
  walletConnected: boolean;
  onPay: () => void;
  onExpired: () => void;
  isPaying: boolean;
}) {
  const [remaining, setRemaining] = useState(() => secondsUntil(quote.quote_expires_at));

  useEffect(() => {
    setRemaining(secondsUntil(quote.quote_expires_at));
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          onExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // Re-arm the countdown whenever a new quote_id arrives — a fresh quote
    // must not inherit the previous one's remaining time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.quote_id]);

  const expired = remaining <= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your quote</CardTitle>
        <p className="mt-1 text-sm text-gray-600">This is what you&apos;ll pay — nothing runs until you confirm.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {quote.endpoint_costs.map((endpoint) => (
            <li key={endpoint.endpoint_id} className="flex items-center justify-between p-3 text-base">
              <span className="text-navy">{endpoint.name}</span>
              <span className="font-medium text-navy">${endpoint.price_usdc.toFixed(2)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between p-3 text-base text-gray-500">
            <span>SBP agent service fee ({quote.markup_pct}%)</span>
            <span>${quote.markup_usdc.toFixed(2)}</span>
          </li>
        </ul>

        <div className="flex items-center justify-between rounded-md bg-light-bg p-3 text-base font-semibold text-navy">
          <span className="flex items-center gap-1">
            Total
            <span
              className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-navy/30 text-xs font-normal text-navy/70"
              title="USDC is a USD-pegged digital currency — 1 USDC = 1 USD, held in your Algorand wallet."
              aria-label="1 USDC equals 1 USD, held in your Algorand wallet"
            >
              ?
            </span>
          </span>
          <span>${quote.total_usdc.toFixed(2)} USDC</span>
        </div>

        {expired ? (
          <p className="text-sm text-red-600">This quote has expired. Request a new one to continue.</p>
        ) : (
          <p className="text-xs text-gray-500">Quote expires in {formatCountdown(remaining)} — re-request if it runs out.</p>
        )}

        <WalletConnect />

        <Button type="button" variant="primary" className="w-full" disabled={!walletConnected || expired || isPaying} onClick={onPay}>
          {isPaying ? "Waiting for payment…" : "Pay and Generate Report"}
        </Button>
      </CardContent>
    </Card>
  );
}
