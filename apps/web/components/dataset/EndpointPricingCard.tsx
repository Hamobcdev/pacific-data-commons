"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PaymentModal, type PaymentModalTier } from "@/components/PaymentModal";
import type { PricingTier } from "@pdc/shared-types";

export interface EndpointPricingCardProps {
  endpointTitle: string;
  endpointUrl: string | null;
  /** process.env.PDC_PILOT_EARNINGS_WALLET, read server-side by the page and passed down — never hardcoded (CLAUDE.md P4/hard rules). */
  payToAddress: string | null;
  tiers: PricingTier[];
}

/** Per-tier "Run Query" opens PaymentModal with that tier's own price and path — pricing_tiers carries no shared single price, each tier is a separately priced query. */
export function EndpointPricingCard({ endpointTitle, endpointUrl, payToAddress, tiers }: EndpointPricingCardProps) {
  const [openTier, setOpenTier] = useState<PaymentModalTier | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-gray-100">
            {tiers.map((tier) => (
              <li key={tier.tier} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium text-navy">{tier.name}</p>
                  <p className="text-xs text-gray-500">{tier.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-medium text-navy">${tier.price_usdc.toFixed(2)}</span>
                  <Button type="button" className="min-h-[36px] px-3 py-1 text-xs" onClick={() => setOpenTier(tier)}>
                    Run Query
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {openTier && (
        <PaymentModal
          endpoint={{ title: endpointTitle, endpoint_url: endpointUrl }}
          tier={openTier}
          payToAddress={payToAddress}
          isOpen={true}
          onClose={() => setOpenTier(null)}
        />
      )}
    </>
  );
}
