"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { registerProvider, type RegisterProviderResult } from "@/actions/tourism/registerProvider";
import type { RegistrationFormState } from "../RegistrationStepper";

/** USDC on Algorand Mainnet (CLAUDE.md Section 6). Same constant as
 * components/PaymentModal.tsx — duplicated rather than imported since that
 * component is scoped to the data-purchase flow, not registration. */
const USDC_ASSET_ID = 31566704;
const REGISTRATION_FEE_USDC = 10;

export interface Step4PaymentProps {
  formState: RegistrationFormState;
  updateFields: (patch: RegistrationFormState) => void;
  onBack: () => void;
  onSubmitted: (result: RegisterProviderResult) => void;
}

type PaymentChoice = "usdc_algorand" | "stripe" | null;
type IntentState = "idle" | "creating" | "ready" | "error";
type SearchState = "idle" | "searching" | "found" | "not_found" | "error";
type ConfirmState = "idle" | "verifying" | "submitting" | "error";

function toMicroUsdc(decimalUsdc: number): number {
  return Math.round(decimalUsdc * 1_000_000);
}

export function Step4Payment({ formState, updateFields, onBack, onSubmitted }: Step4PaymentProps) {
  const [choice, setChoice] = useState<PaymentChoice>(null);
  const [intentState, setIntentState] = useState<IntentState>("idle");
  const [intentError, setIntentError] = useState<string | null>(null);
  const [referenceId, setReferenceId] = useState<string | null>((formState._referenceId as string) ?? null);
  const [payToAddress, setPayToAddress] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [algoTxId, setAlgoTxId] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [confirmState, setConfirmState] = useState<ConfirmState>("idle");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const stripeSubmitted = useRef(false);

  const email = (formState.contact_email as string) ?? "";
  const walletAddress = (formState.wallet_address as string) ?? undefined;

  // Returning from a Stripe redirect — Step4Payment is mounted with
  // _paymentMethod/_paymentReference already set by RegistrationStepper, so
  // submit immediately rather than showing the payment picker again.
  useEffect(() => {
    if (formState._paymentMethod === "stripe" && formState._paymentReference && !stripeSubmitted.current) {
      stripeSubmitted.current = true;
      setChoice("stripe");
      setConfirmState("submitting");
      void submitRegistration("stripe", String(formState._paymentReference), "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const deeplink =
    payToAddress && referenceId
      ? `algorand://${payToAddress}?amount=${toMicroUsdc(REGISTRATION_FEE_USDC)}&asset=${USDC_ASSET_ID}&xnote=${referenceId}`
      : null;

  useEffect(() => {
    if (!deeplink) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(deeplink, { width: 200, margin: 1 }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [deeplink]);

  async function startUsdcPayment() {
    setChoice("usdc_algorand");
    if (referenceId) return; // already created
    setIntentState("creating");
    setIntentError(null);
    try {
      const res = await fetch("/api/payment/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "registration_fee",
          tierPath: "/register/provider-fee",
          amountUsdc: REGISTRATION_FEE_USDC,
          email,
          walletAddress,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.referenceId !== "string") {
        setIntentState("error");
        setIntentError(typeof data?.error === "string" ? data.error : "Could not start payment — please try again.");
        return;
      }
      setReferenceId(data.referenceId);
      setPayToAddress(typeof data.payToAddress === "string" ? data.payToAddress : null);
      updateFields({ _referenceId: data.referenceId });
      setIntentState("ready");
    } catch {
      setIntentState("error");
      setIntentError("Could not start payment — please try again.");
    }
  }

  async function startStripeCheckout() {
    setChoice("stripe");
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "registration_fee", contactEmail: email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.checkoutUrl !== "string") {
        setIntentError(typeof data?.message === "string" ? data.message : "Card payment is not available right now.");
        setCheckoutLoading(false);
        return;
      }
      // Full-page redirect — form state is already persisted to
      // localStorage by RegistrationStepper's effect.
      window.location.href = data.checkoutUrl;
    } catch {
      setIntentError("Card payment is not available right now.");
      setCheckoutLoading(false);
    }
  }

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

  async function submitRegistration(paymentMethod: "usdc_algorand" | "stripe", paymentReference: string, refId: string) {
    const result = await registerProvider({ formData: formState, paymentMethod, paymentReference, referenceId: refId });
    if (!result.success) {
      setConfirmState("error");
      setConfirmError(result.error ?? "Registration could not be completed. Please try again.");
      return;
    }
    onSubmitted(result);
  }

  async function handleConfirmUsdc(e: React.FormEvent) {
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
      // The Worker's response text/download_url are for the data-purchase
      // flow — intentionally ignored here. res.ok is the only signal used.
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setConfirmState("error");
        setConfirmError(typeof data?.error === "string" ? data.error : "Payment could not be verified — please check your transaction ID.");
        return;
      }
      setConfirmState("submitting");
      await submitRegistration("usdc_algorand", trimmedTxId, referenceId);
    } catch {
      setConfirmState("error");
      setConfirmError("Payment could not be verified — please try again.");
    }
  }

  if (confirmState === "submitting" || (choice === "stripe" && stripeSubmitted.current && confirmState !== "error")) {
    return (
      <div className="py-10 text-center">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-ocean border-t-transparent" aria-hidden="true" />
        <p className="mt-3 text-sm text-gray-600">Payment verified — submitting your registration…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-navy">Pay the $10 registration fee</h2>

      {Boolean(formState._stripeCancelled) && (
        <Alert variant="warning" className="text-xs">
          Your card payment was cancelled. You can try again below.
        </Alert>
      )}
      {confirmError && (
        <Alert variant="error" className="text-xs">
          {confirmError}
        </Alert>
      )}
      {intentError && (
        <Alert variant="error" className="text-xs">
          {intentError}
        </Alert>
      )}

      {choice === null && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Button type="button" onClick={startUsdcPayment}>
            Pay with USDC (Algorand)
          </Button>
          <Button type="button" variant="secondary" onClick={startStripeCheckout} disabled={checkoutLoading}>
            {checkoutLoading ? "Redirecting…" : "Pay with Card"}
          </Button>
        </div>
      )}

      {choice === "usdc_algorand" && (
        <div className="space-y-4">
          {intentState === "creating" && <p className="text-sm text-gray-600">Generating payment details…</p>}

          {intentState === "ready" && payToAddress && (
            <>
              <div className="flex justify-center">
                {qrDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- data: URI
                  <img src={qrDataUrl} alt="QR code of the Algorand payment request" width={200} height={200} />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500">Send $10.00 USDC to</p>
                <p className="break-all rounded-md bg-light-bg p-2 font-mono text-xs text-gray-700">{payToAddress}</p>
              </div>
              <Alert variant="info" className="text-xs">
                This is a direct transfer — SBP does not hold this payment. After paying, use the button below to confirm.
              </Alert>

              {searchState === "found" ? (
                <form onSubmit={handleConfirmUsdc} className="space-y-2">
                  <p className="text-xs text-green-700">Payment found — transaction {algoTxId.slice(0, 10)}…</p>
                  <Button type="submit" className="w-full" disabled={confirmState === "verifying"}>
                    {confirmState === "verifying" ? "Confirming…" : "Confirm & Submit Registration"}
                  </Button>
                </form>
              ) : (
                <div className="space-y-2">
                  {searchState === "searching" ? (
                    <p className="text-xs text-gray-600">Looking for your payment on the blockchain…</p>
                  ) : (
                    <>
                      {searchState === "not_found" && (
                        <Alert variant="warning" className="text-xs">
                          Not found yet — the blockchain can take up to 30 seconds. Try again shortly.
                        </Alert>
                      )}
                      <Button type="button" className="w-full" onClick={handleSearchPayment}>
                        I&apos;ve completed my payment
                      </Button>
                    </>
                  )}
                </div>
              )}

              <details className="rounded-md border border-gray-200 p-3">
                <summary className="cursor-pointer text-xs font-medium text-gray-700">Enter transaction ID manually</summary>
                <form onSubmit={handleConfirmUsdc} className="mt-3 space-y-2">
                  <Input
                    type="text"
                    value={algoTxId}
                    onChange={(e) => setAlgoTxId(e.target.value)}
                    placeholder="Transaction ID"
                    className="font-mono text-xs"
                    disabled={confirmState === "verifying"}
                  />
                  <Button type="submit" variant="secondary" className="w-full text-xs" disabled={confirmState === "verifying"}>
                    {confirmState === "verifying" ? "Verifying on-chain…" : "Confirm Payment"}
                  </Button>
                </form>
              </details>
            </>
          )}
        </div>
      )}

      <div className="flex justify-start pt-2">
        <Button type="button" variant="secondary" onClick={onBack} disabled={confirmState === "verifying"}>
          Back
        </Button>
      </div>
    </div>
  );
}
