"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

/** USDC on Algorand Mainnet (CLAUDE.md Section 6 — Blockchain: Algorand Mainnet). */
const USDC_ASSET_ID = 31566704;

export interface PaymentModalTier {
  name: string;
  description: string;
  price_usdc: number;
  path: string;
}

export interface PaymentModalProps {
  endpoint: {
    title: string;
    /** Base directory-api URL, e.g. "https://api.synergybcpacific.com" — tier.path is appended to build the full query URL. Null when the provider hasn't set one yet. */
    endpoint_url: string | null;
  };
  tier: PaymentModalTier;
  /** process.env.PDC_PILOT_EARNINGS_WALLET, read server-side and passed down — never hardcoded (CLAUDE.md P4/hard rules). Null when not configured. */
  payToAddress: string | null;
  isOpen: boolean;
  onClose: () => void;
}

function toMicroUsdc(decimalUsdc: number): number {
  return Math.round(decimalUsdc * 1_000_000);
}

/**
 * Manual USDC payment instructions for a PDC endpoint (Pera Wallet deeplink +
 * QR). Deliberately NOT an x402 integration point and deliberately does not
 * attempt to fire the paid query itself: apps/directory-api's payment gate
 * (pdc-x402-adapter -> @x402/hono) requires a signed payment attached to the
 * HTTP request itself, which a manual out-of-band wallet transfer has no way
 * to produce. A prior design here that auto-fired the query after "I've
 * paid" would have let a buyer send real USDC and then hit a 402 with
 * nothing to show for it — see this component's PR description for the
 * full reasoning. This modal is honest about that boundary: it shows how to
 * pay and how to query, and points buyers who don't have an x402-capable
 * client at the agent marketplace instead.
 */
export function PaymentModal({ endpoint, tier, payToAddress, isOpen, onClose }: PaymentModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<"address" | "url" | null>(null);

  const queryUrl = endpoint.endpoint_url ? `${endpoint.endpoint_url.replace(/\/$/, "")}${tier.path}` : null;
  const deeplink = payToAddress
    ? `perawallet://pay?to=${payToAddress}&amount=${toMicroUsdc(tier.price_usdc)}&asset=${USDC_ASSET_ID}`
    : null;

  useEffect(() => {
    if (!isOpen || !deeplink) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(deeplink, { width: 220, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [isOpen, deeplink]);

  if (!isOpen) return null;

  const copy = (text: string, field: "address" | "url") => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-navy">{endpoint.title}</h3>
        <p className="mt-1 text-xs text-gray-500">{tier.description}</p>
        <p className="mt-3 text-lg font-semibold text-navy">${tier.price_usdc.toFixed(2)} USDC</p>

        {!payToAddress ? (
          <Alert variant="warning" className="mt-4">
            Payment is not yet configured for this endpoint. Contact anthony@synergybcpacific.com.
          </Alert>
        ) : (
          <>
            <div className="mt-4 flex justify-center">
              {qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- data: URI, not an optimisable remote image
                <img src={qrDataUrl} alt="QR code of the Pera Wallet payment deeplink" width={220} height={220} />
              )}
            </div>

            <div className="mt-4 space-y-1">
              <p className="text-xs font-medium text-gray-500">Provider wallet (Algorand, USDC)</p>
              <div className="flex items-center gap-2">
                <p className="flex-1 break-all rounded-md bg-light-bg p-2 font-mono text-xs text-gray-700">{payToAddress}</p>
                <Button type="button" variant="secondary" className="shrink-0 px-2 py-1 text-xs" onClick={() => copy(payToAddress, "address")}>
                  {copiedField === "address" ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            <Alert variant="info" className="mt-4 text-xs">
              Scan the QR code or send <strong>${tier.price_usdc.toFixed(2)} USDC</strong> directly to the wallet above using Pera
              Wallet or another Algorand wallet. This is a direct transfer to the provider — SBP does not process or hold this
              payment.
            </Alert>

            <div className="mt-4 space-y-1">
              <p className="text-xs font-medium text-gray-500">After paying, query this endpoint</p>
              {queryUrl ? (
                <div className="flex items-center gap-2">
                  <p className="flex-1 break-all rounded-md bg-light-bg p-2 font-mono text-xs text-gray-700">{queryUrl}</p>
                  <Button type="button" variant="secondary" className="shrink-0 px-2 py-1 text-xs" onClick={() => copy(queryUrl, "url")}>
                    {copiedField === "url" ? "Copied" : "Copy"}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-gray-500">This provider hasn't set a query URL for this endpoint yet.</p>
              )}
              <p className="text-xs text-gray-500">
                This endpoint is gated by the x402 payment protocol — it requires an x402-capable client (a signed payment
                attached to the request itself) to complete the query, not just a prior manual transfer. Use an x402-aware tool,
                or{" "}
                <a href="/agents" className="text-ocean hover:underline">
                  browse the agent marketplace
                </a>{" "}
                to have an agent pay and query it for you.
              </p>
            </div>
          </>
        )}

        <Button type="button" variant="ghost" className="mt-4 w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
