"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";

/** USDC on Algorand Mainnet (CLAUDE.md Section 6 — Blockchain: Algorand Mainnet). */
const USDC_ASSET_ID = 31566704;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  /** endpoints.id — needed to create the payment_intents row (Step 1 of the human payment rail). */
  endpointId: string;
  tier: PaymentModalTier;
  /** process.env.AVM_ADDRESS, read server-side and passed down — never hardcoded (CLAUDE.md P4/hard rules). Null when not configured. */
  payToAddress: string | null;
  isOpen: boolean;
  onClose: () => void;
}

function toMicroUsdc(decimalUsdc: number): number {
  return Math.round(decimalUsdc * 1_000_000);
}

type ModalStep = "email" | "payment";
type ConfirmState = "idle" | "verifying" | "success" | "error";
type SearchState = "idle" | "searching" | "found" | "not_found" | "error";

/**
 * Manual USDC payment instructions for a PDC endpoint (ARC-26 Algorand URI +
 * QR — wallet-agnostic, scannable by any Algorand wallet app), extended with
 * the human payment rail (competition, simplified flow —
 * see CLAUDE.md's payment-rail intelligence report and build prompt).
 *
 * Still deliberately NOT an x402 integration point: apps/directory-api's
 * payment gate (pdc-x402-adapter -> @x402/hono) requires a signed payment
 * attached to the HTTP request itself, which a manual out-of-band wallet
 * transfer can never produce. What's new here is a two-step flow that lets
 * a human who paid out-of-band actually get their data without an
 * x402-capable client: Step A captures an email + generates a reference ID
 * before showing the QR; Step B shows the QR (now with the reference ID
 * embedded in the ARC-26 xnote field, not just displayed on screen) plus a
 * one-click "I've completed my payment" search — POST /api/payment/search
 * asks the Worker to find a confirmed on-chain transfer whose note matches
 * this reference ID, so most buyers never type a txId at all. A collapsed
 * "find it manually" section remains as a fallback for wallets that strip
 * the note or when the search doesn't find a match. Either path converges
 * on the same manual-style confirmation (POST /api/payment/confirm), which
 * the Worker verifies against the Algorand indexer and, on success, emails
 * a one-time download token for a human-readable delivery page. See
 * POST /api/payment/intent, POST /api/payment/search, and
 * POST /api/payment/confirm.
 */
export function PaymentModal({ endpoint, endpointId, tier, payToAddress, isOpen, onClose }: PaymentModalProps) {
  const [step, setStep] = useState<ModalStep>("email");

  // Step A — email capture
  const [email, setEmail] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submittingIntent, setSubmittingIntent] = useState(false);

  // Populated once /api/payment/intent succeeds — drives Step B.
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [resolvedPayToAddress, setResolvedPayToAddress] = useState<string | null>(payToAddress);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<"address" | "url" | "txid" | null>(null);

  // Step B — "already paid?" confirmation. algoTxId is populated either
  // automatically (handleSearchPayment, via the indexer note-prefix search —
  // see apps/directory-api's POST /payment/search) or manually (the
  // escape-hatch input in the collapsed help section below) — both paths
  // converge on the same handleConfirmSubmit.
  const [algoTxId, setAlgoTxId] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState>("idle");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<SearchState>("idle");

  const queryUrl = endpoint.endpoint_url ? `${endpoint.endpoint_url.replace(/\/$/, "")}${tier.path}` : null;
  // xnote carries the referenceId (ARC-26: base64-encoded note) so
  // apps/directory-api's POST /payment/search can find this exact payment
  // on-chain by note-prefix instead of requiring the user to paste a txId.
  const deeplink =
    resolvedPayToAddress && referenceId
      ? `algorand://${resolvedPayToAddress}?amount=${toMicroUsdc(tier.price_usdc)}&asset=${USDC_ASSET_ID}&xnote=${referenceId}`
      : null;

  useEffect(() => {
    if (step !== "payment" || !deeplink) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(deeplink, { width: 220, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [step, deeplink]);

  if (!isOpen) return null;

  const copy = (text: string, field: "address" | "url" | "txid") => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
      })
      .catch(() => {});
  };

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);
    setSubmittingIntent(true);
    try {
      const res = await fetch("/api/payment/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpointId,
          tierPath: tier.path,
          amountUsdc: tier.price_usdc,
          email: trimmedEmail,
          walletAddress: walletAddress.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.referenceId !== "string") {
        setEmailError(typeof data?.error === "string" ? data.error : "Could not start payment — please try again.");
        return;
      }
      setReferenceId(data.referenceId);
      setResolvedPayToAddress(typeof data.payToAddress === "string" ? data.payToAddress : payToAddress);
      setStep("payment");
    } catch {
      setEmailError("Could not start payment — please try again.");
    } finally {
      setSubmittingIntent(false);
    }
  }

  async function handleConfirmSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!referenceId) return;
    const trimmedTxId = algoTxId.trim();
    if (!trimmedTxId) {
      setConfirmError("Enter your Algorand transaction ID.");
      return;
    }
    setConfirmError(null);
    setConfirmState("verifying");
    try {
      const res = await fetch("/api/payment/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceId, algoTxId: trimmedTxId }),
      });
      // Read the response body exactly once — reused below for the
      // success case rather than calling res.json() again (a second call
      // would throw, the body stream is already consumed).
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setConfirmState("error");
        setConfirmError(typeof data?.error === "string" ? data.error : "Payment could not be verified — please check your transaction ID.");
        return;
      }
      if (typeof data?.download_url === "string") {
        setDownloadUrl(data.download_url);
      }
      setConfirmState("success");
    } catch {
      setConfirmState("error");
      setConfirmError("Payment could not be verified — please try again.");
    }
  }

  /**
   * On-demand indexer search (CHANGE 2/3) — asks apps/directory-api to look
   * for a confirmed USDC transfer to this endpoint's payTo address whose
   * on-chain note matches this referenceId, instead of asking the user to
   * copy a txId out of their wallet app themselves. Triggered by a button
   * click, not polling — one search per click.
   */
  async function handleSearchPayment() {
    if (!referenceId) return;
    setSearchState("searching");
    try {
      const res = await fetch("/api/payment/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSearchState("error");
        return;
      }
      if (data?.found === true && typeof data.txId === "string" && data.txId.length > 0) {
        setAlgoTxId(data.txId);
        setSearchState("found");
      } else {
        setSearchState("not_found");
      }
    } catch {
      setSearchState("error");
    }
  }

  // Display-only — last 8 chars of the full reference ID, uppercased. Not
  // embedded in the QR URI — this is purely a shorter string for the buyer
  // to read back when they submit their tx ID in the confirmation step below.
  const referenceIdDisplay = referenceId ? referenceId.slice(-8).toUpperCase() : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-semibold text-navy">{endpoint.title}</h3>
        <p className="mt-1 text-xs text-gray-500">{tier.description}</p>
        <p className="mt-3 text-lg font-semibold text-navy">${tier.price_usdc.toFixed(2)} USDC</p>

        {!payToAddress ? (
          <Alert variant="warning" className="mt-4">
            Payment is not yet configured for this endpoint. Contact anthony@synergybcpacific.com.
          </Alert>
        ) : step === "email" ? (
          <form onSubmit={handleEmailSubmit} className="mt-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Where should we send your data?</p>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Email address <span className="text-red-500">*</span>
              </label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Your Algorand wallet address <span className="text-gray-400">(optional)</span>
              </label>
              <Input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="Leave blank if you'd rather not share it"
                className="font-mono text-xs"
              />
            </div>
            {emailError && <p className="text-xs text-red-600">{emailError}</p>}
            <Button type="submit" className="w-full" disabled={submittingIntent}>
              {submittingIntent ? "Generating…" : "Generate Payment QR"}
            </Button>
          </form>
        ) : (
          <>
            <div className="mt-4 flex justify-center">
              {qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- data: URI, not an optimisable remote image
                <img src={qrDataUrl} alt="QR code of the Algorand payment request" width={220} height={220} />
              )}
            </div>

            {referenceIdDisplay && (
              <p className="mt-3 text-center text-sm font-semibold text-navy">
                Your reference ID: <span className="font-mono">PDC-{referenceIdDisplay}</span>
              </p>
            )}

            <div className="mt-4 space-y-1">
              <p className="text-xs font-medium text-gray-500">Provider wallet (Algorand, USDC)</p>
              <div className="flex items-center gap-2">
                <p className="flex-1 break-all rounded-md bg-light-bg p-2 font-mono text-xs text-gray-700">{resolvedPayToAddress}</p>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 px-2 py-1 text-xs"
                  onClick={() => resolvedPayToAddress && copy(resolvedPayToAddress, "address")}
                >
                  {copiedField === "address" ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            <Alert variant="info" className="mt-4 text-xs">
              Scan the QR code or send <strong>${tier.price_usdc.toFixed(2)} USDC</strong> directly to the wallet above using your
              Algorand wallet. This is a direct transfer to the provider — SBP does not process or hold this payment. Keep your
              reference ID (shown above) handy for the confirmation step below.
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
                attached to the request itself) to complete the query, not just a prior manual transfer. Use an x402-aware tool,{" "}
                <a href="/agents" className="text-ocean hover:underline">
                  browse the agent marketplace
                </a>
                , or confirm your manual payment below to have the data emailed to you as a formatted page instead.
              </p>
            </div>

            {confirmState === "success" ? (
              <div className="mt-4 rounded-md border border-gray-200 p-3">
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-medium text-green-700">
                    ✓ Payment verified. Your download link has been sent to your email.
                  </p>
                  {downloadUrl && (
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center px-4 py-2 bg-green-700 text-white text-sm font-medium rounded-md hover:bg-green-800 transition-colors"
                    >
                      Download Data
                    </a>
                  )}
                  <p className="text-xs text-gray-500">
                    This link can only be used once. Save or print your data after opening.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-4 space-y-3 rounded-md border border-gray-200 p-3">
                  {searchState === "found" ? (
                    <>
                      <Alert variant="success" className="text-xs">
                        Payment confirmed! Your transaction ID has been found automatically.
                      </Alert>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-500">Transaction ID</p>
                        <div className="flex items-center gap-2">
                          <p className="flex-1 break-all rounded-md bg-light-bg p-2 font-mono text-xs text-gray-700">{algoTxId}</p>
                          <Button type="button" variant="secondary" className="shrink-0 px-2 py-1 text-xs" onClick={() => copy(algoTxId, "txid")}>
                            {copiedField === "txid" ? "Copied" : "Copy"}
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        This code confirms your payment was received. Click the button below to receive your download link by email.
                      </p>
                      <form onSubmit={handleConfirmSubmit} className="space-y-2">
                        {confirmError && <p className="text-xs text-red-600">{confirmError}</p>}
                        <Button type="submit" className="w-full" disabled={confirmState === "verifying"}>
                          {confirmState === "verifying" ? "Confirming…" : "Confirm & Send Download Link"}
                        </Button>
                      </form>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-medium text-gray-700">Already paid?</p>
                      {searchState === "searching" ? (
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-ocean border-t-transparent" aria-hidden="true" />
                          Looking for your payment on the blockchain…
                        </div>
                      ) : (
                        <>
                          {searchState === "not_found" && (
                            <Alert variant="warning" className="text-xs">
                              Payment not found yet — the blockchain can take up to 30 seconds to confirm. Wait a moment and try again.
                            </Alert>
                          )}
                          {searchState === "error" && (
                            <Alert variant="error" className="text-xs">
                              Something went wrong checking your payment. Please try again or contact support.
                            </Alert>
                          )}
                          <Button type="button" className="w-full" onClick={handleSearchPayment}>
                            I&apos;ve completed my payment
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Manual fallback — always available, never removed. */}
                <details className="mt-3 rounded-md border border-gray-200 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-gray-700">
                    Where do I find my Transaction ID manually?
                  </summary>
                  <div className="mt-3 space-y-3">
                    <ol className="list-decimal space-y-1 pl-4 text-xs text-gray-600">
                      <li>Open your Pera Wallet app</li>
                      <li>Tap &quot;Activity&quot; or &quot;History&quot;</li>
                      <li>Find the payment you just made</li>
                      <li>Tap it to open the details</li>
                      <li>Copy the Transaction ID at the bottom</li>
                    </ol>
                    <form onSubmit={handleConfirmSubmit} className="space-y-2">
                      <Input
                        type="text"
                        value={algoTxId}
                        onChange={(e) => setAlgoTxId(e.target.value)}
                        placeholder="Transaction ID"
                        className="font-mono text-xs"
                        disabled={confirmState === "verifying"}
                      />
                      {confirmError && <p className="text-xs text-red-600">{confirmError}</p>}
                      <Button type="submit" variant="secondary" className="w-full text-xs" disabled={confirmState === "verifying"}>
                        {confirmState === "verifying" ? "Verifying on-chain…" : "Confirm Payment"}
                      </Button>
                    </form>
                  </div>
                </details>
              </>
            )}
          </>
        )}

        <Button type="button" variant="ghost" className="mt-4 w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
