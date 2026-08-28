"use client";

import { useEffect, useState, useTransition } from "react";
import QRCode from "qrcode";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { previewInvoiceReference, requestAssistedDeployment, submitDeploymentPayment } from "@/actions/onboarding/deploy-request";
import { saveLocalState, loadLocalState, defaultState } from "@/lib/onboarding/state";
import { SESSION_EXPIRED_ERROR } from "@/lib/onboarding/session-constants";
import { flagSessionExpired } from "@/lib/onboarding/flag-session-expired";
import { ASSISTED_DEPLOYMENT_PRICE_USDC, BANK_TRANSFER_SURCHARGE_USD } from "@/lib/deploy/pricing";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface AssistedCardProps {
  providerId: string;
  sessionToken: string;
  providerContactEmail: string;
}

type ConfirmedInvoice = { id: string; reference: string };

/**
 * Card 2 — SBP Assisted (Session 37B). Two-step inline expansion: "Request
 * SBP assistance" previews a reference and expands the payment section;
 * "Confirm request" performs the real insert (its own reference generation,
 * independent of the preview — see requestAssistedDeployment()'s comment)
 * and fires Emails A + B.
 *
 * Branches on ASSISTED_DEPLOYMENT_PRICE_USDC (currently 0 — Session 37B's
 * free promotional period, CLAUDE.md Section 7): free flow advances
 * straight to /onboarding/complete on confirm; the paid flow (unreachable
 * today, exercised by temporarily setting the constant) shows USDC payment
 * instructions with a QR code of process.env.NEXT_PUBLIC_SBP_PAYTO_ADDRESS,
 * a bank transfer alternative (+$50 surcharge), and an "I have sent
 * payment" form before advancing.
 */
export function AssistedCard({ providerId, sessionToken, providerContactEmail }: AssistedCardProps) {
  const tShell = useTranslations("Onboarding.shell");
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [previewReference, setPreviewReference] = useState<string | null>(null);
  const [confirmedInvoice, setConfirmedInvoice] = useState<ConfirmedInvoice | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isConfirming, startConfirm] = useTransition();
  const [isSubmittingPayment, startSubmitPayment] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"usdc" | "bank_transfer">("usdc");
  const [paymentReferenceInput, setPaymentReferenceInput] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const payToAddress = process.env.NEXT_PUBLIC_SBP_PAYTO_ADDRESS;

  useEffect(() => {
    if (!confirmedInvoice || ASSISTED_DEPLOYMENT_PRICE_USDC === 0 || !payToAddress) return;
    QRCode.toDataURL(payToAddress, { width: 180, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [confirmedInvoice, payToAddress]);

  const handleRequestAssistance = () => {
    setError(null);
    startPreview(async () => {
      try {
        const reference = await previewInvoiceReference();
        setPreviewReference(reference);
        setExpanded(true);
      } catch {
        setError("Could not prepare your request. Please try again.");
      }
    });
  };

  const advanceToComplete = () => {
    const state = loadLocalState() ?? defaultState();
    saveLocalState({ ...state, currentStep: "complete", deploy: { ...state.deploy, path: "sbp_managed" } });
    router.push("/onboarding/complete");
  };

  const handleConfirmRequest = () => {
    setError(null);
    startConfirm(async () => {
      const result = await requestAssistedDeployment(providerId, sessionToken);
      if (!result.success || !result.invoiceReference || !result.invoiceId) {
        if (result.error === SESSION_EXPIRED_ERROR) {
          flagSessionExpired(tShell("sessionExpired"));
          router.push("/onboarding");
          return;
        }
        setError(result.error ?? "Could not submit your deployment request. Please try again.");
        return;
      }

      if (!result.paymentRequired) {
        advanceToComplete();
        return;
      }
      setConfirmedInvoice({ id: result.invoiceId, reference: result.invoiceReference });
    });
  };

  const handleSubmitPayment = () => {
    if (!confirmedInvoice) return;
    setError(null);
    startSubmitPayment(async () => {
      const result = await submitDeploymentPayment(providerId, sessionToken, confirmedInvoice.id, paymentMethod, paymentReferenceInput);
      if (!result.success) {
        if (result.error === SESSION_EXPIRED_ERROR) {
          flagSessionExpired(tShell("sessionExpired"));
          router.push("/onboarding");
          return;
        }
        setError(result.error ?? "Could not record your payment. Please try again.");
        return;
      }
      advanceToComplete();
    });
  };

  return (
    <div className="flex flex-col rounded-lg border border-ocean bg-light-bg p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-navy">We handle the technical work</h3>
        <span className="rounded-full bg-ocean/10 px-2.5 py-0.5 text-xs font-medium text-ocean">Currently Free — Limited Time</span>
      </div>

      <p className="mt-3 text-sm text-gray-700 leading-relaxed">
        SBP structures your data, deploys your endpoint, tests it with a live query, and registers it in the
        directory. Currently free for all Pacific institutions.
      </p>
      <p className="mt-2 text-xs text-gray-500">
        Standard price $25 USDC when reintroduced. All registered providers will be notified before pricing changes.
      </p>
      <p className="mt-2 text-xs text-gray-500">
        Suitable for clean, single-topic datasets in one of the 21 PDC data categories. For multiple datasets or
        complex integration, choose the option below.
      </p>

      {!expanded ? (
        <Button type="button" className="mt-4 min-h-[44px]" onClick={handleRequestAssistance} disabled={isPreviewing}>
          {isPreviewing ? "Preparing..." : "Request SBP assistance"}
        </Button>
      ) : !confirmedInvoice ? (
        <div className="mt-4 rounded-md border border-gray-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-navy">Your deployment request</h4>
          <p className="mt-2 text-sm text-gray-700">
            Reference: <span className="font-mono">{previewReference}</span>
          </p>
          {ASSISTED_DEPLOYMENT_PRICE_USDC === 0 ? (
            <p className="mt-2 text-sm text-gray-700">
              SBP will contact you at {providerContactEmail} within 1 business day to begin deployment work.
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-700">
              Standard price: ${ASSISTED_DEPLOYMENT_PRICE_USDC} USDC. Payment instructions follow on the next step.
            </p>
          )}

          {error && (
            <Alert variant="error" className="mt-3">
              {error}
            </Alert>
          )}

          <Button type="button" className="mt-3 min-h-[44px]" onClick={handleConfirmRequest} disabled={isConfirming}>
            {isConfirming ? "Confirming..." : "Confirm request"}
          </Button>
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-gray-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-navy">Payment instructions</h4>
          <p className="mt-2 text-sm text-gray-700">
            Reference: <span className="font-mono">{confirmedInvoice.reference}</span> — include this in your
            transaction note.
          </p>

          <div className="mt-4 flex gap-2 rounded-md bg-white p-1 text-sm">
            <button
              type="button"
              onClick={() => setPaymentMethod("usdc")}
              className={`flex-1 rounded-md px-3 py-2 min-h-[44px] ${paymentMethod === "usdc" ? "bg-ocean text-white" : "bg-light-bg text-gray-700"}`}
            >
              Pay with USDC
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("bank_transfer")}
              className={`flex-1 rounded-md px-3 py-2 min-h-[44px] ${paymentMethod === "bank_transfer" ? "bg-ocean text-white" : "bg-light-bg text-gray-700"}`}
            >
              Bank transfer (+${BANK_TRANSFER_SURCHARGE_USD})
            </button>
          </div>

          {paymentMethod === "usdc" ? (
            <div className="mt-4 space-y-3">
              {!payToAddress ? (
                <Alert variant="warning">USDC payment is not yet configured. Contact anthony@synergybcpacific.com.</Alert>
              ) : (
                <>
                  {qrDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- data: URI, not an optimisable remote image
                    <img src={qrDataUrl} alt="QR code of the SBP PayTo Algorand wallet address" width={180} height={180} />
                  )}
                  <p className="break-all rounded-md bg-light-bg p-2 font-mono text-xs text-gray-700">{payToAddress}</p>
                  <label className="block text-xs font-medium text-gray-500">
                    Algorand transaction ID
                    <input
                      type="text"
                      value={paymentReferenceInput}
                      onChange={(e) => setPaymentReferenceInput(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Paste your transaction ID after sending payment"
                    />
                  </label>
                </>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-gray-700">
                Contact anthony@synergybcpacific.com for bank transfer details. Includes a +${BANK_TRANSFER_SURCHARGE_USD} surcharge.
              </p>
              <label className="block text-xs font-medium text-gray-500">
                Bank transfer reference
                <input
                  type="text"
                  value={paymentReferenceInput}
                  onChange={(e) => setPaymentReferenceInput(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Your bank's transfer reference"
                />
              </label>
            </div>
          )}

          {error && (
            <Alert variant="error" className="mt-3">
              {error}
            </Alert>
          )}

          <Button
            type="button"
            className="mt-3 min-h-[44px]"
            onClick={handleSubmitPayment}
            disabled={isSubmittingPayment || (paymentMethod === "usdc" && !payToAddress)}
          >
            {isSubmittingPayment ? "Submitting..." : "I have sent payment"}
          </Button>
        </div>
      )}
    </div>
  );
}
