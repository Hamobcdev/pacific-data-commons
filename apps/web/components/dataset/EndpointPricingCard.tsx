"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaymentModal, type PaymentModalTier } from "@/components/PaymentModal";
import { isHumanDeliverablePath, type PricingTier } from "@pdc/shared-types";

/** PDC has no dedicated contact/support page yet — mailto is the fallback per this feature's build brief. */
const AGENT_ONLY_CONTACT_HREF = "mailto:hello@synergybcpacific.com";

export interface EndpointPricingCardProps {
  endpointTitle: string;
  endpointUrl: string | null;
  /** endpoints.id — threaded down to PaymentModal for the payment_intents row (human payment rail). */
  endpointId: string;
  /** process.env.AVM_ADDRESS, read server-side by the page and passed down — never hardcoded (CLAUDE.md P4/hard rules). */
  payToAddress: string | null;
  tiers: PricingTier[];
}

/** Per-tier "Run Query" opens PaymentModal with that tier's own price and path — pricing_tiers carries no shared single price, each tier is a separately priced query. */
export function EndpointPricingCard({ endpointTitle, endpointUrl, endpointId, payToAddress, tiers }: EndpointPricingCardProps) {
  const [openTier, setOpenTier] = useState<PaymentModalTier | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-gray-100">
            {tiers.map((tier) => {
              const humanDeliverable = isHumanDeliverablePath(tier.path);
              return (
                <li key={tier.tier} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <p className="font-medium text-navy">{tier.name}</p>
                    <p className="text-xs text-gray-500">{tier.description}</p>
                    {!humanDeliverable && (
                      <p className="mt-1 text-xs text-gray-500">
                        Agent API endpoint — programmatic access only. Requires developer integration.{" "}
                        <a href={AGENT_ONLY_CONTACT_HREF} className="text-ocean hover:underline">
                          Contact us to get started.
                        </a>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-medium text-navy">${tier.price_usdc.toFixed(2)}</span>
                    {humanDeliverable ? (
                      <Button type="button" className="min-h-[36px] px-3 py-1 text-xs" onClick={() => setOpenTier(tier)}>
                        Run Query
                      </Button>
                    ) : (
                      <Badge variant="neutral">Agent API only</Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {openTier && (
        <PaymentModal
          endpoint={{ title: endpointTitle, endpoint_url: endpointUrl }}
          endpointId={endpointId}
          tier={openTier}
          payToAddress={payToAddress}
          isOpen={true}
          onClose={() => setOpenTier(null)}
        />
      )}
    </>
  );
}
