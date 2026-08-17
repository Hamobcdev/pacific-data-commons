"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { loadLocalState } from "@/lib/onboarding/state";
import { checkUploadPaymentStatus, submitUsdcPaymentClaim, requestUploadInvoice } from "@/actions/upload/upload-payment";
import { UPLOAD_FEE_USDC } from "@/lib/upload/constants";
import { Alert } from "@/components/ui/alert";

/**
 * Session 23 (Deliverable 3B, Decision 58) — blocks UploadForm behind a
 * confirmed upload_payments row. No free tier for cold inbound uploads.
 *
 * Deliberately does NOT sign or submit an on-chain transaction itself —
 * there is no existing wallet-signing pattern anywhere in this app to build
 * on (WalletForm.tsx only validates an address format; it never constructs
 * a transaction), and inventing one here would be new, untested,
 * security-sensitive code moving real USDC. Instead: this screen shows
 * SBP's collection address and amount, the provider pays from any wallet
 * they choose and pastes back the transaction ID, and the claim sits in
 * 'pending' until an SBP admin verifies it on-chain and flips the row to
 * 'confirmed' (currently a manual Supabase check — no admin UI for this
 * yet). Real wallet-signing is still a follow-up (not built here); the
 * "pay by card" option below goes through Stripe Checkout instead
 * (app/api/stripe/checkout, Deliverable 4) — that path writes a confirmed
 * row automatically via the webhook, no manual verification needed.
 */
export function UploadPaymentGate({ children }: { children: ReactNode }) {
  const t = useTranslations("Onboarding.Upload.payment");
  const router = useRouter();

  const [providerId, setProviderId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"checking" | "redirecting" | "unpaid" | "pending" | "confirmed">("checking");
  const [error, setError] = useState<string | null>(null);
  const [txId, setTxId] = useState("");
  const [submitting, setSubmitting] = useState<"usdc" | "invoice" | "card" | null>(null);
  // Set when returning from Stripe Checkout (?stripe=success) and the
  // webhook hasn't written the confirmed row yet (it fires async, on
  // Stripe's own delivery timing — not this request). Read from
  // window.location rather than next/navigation's useSearchParams, which
  // in the App Router requires wrapping this component in a <Suspense>
  // boundary — not worth the structural change for a single transient flag.
  const [awaitingWebhook, setAwaitingWebhook] = useState(false);

  useEffect(() => {
    const state = loadLocalState();
    if (!state?.providerId || !state.sessionToken) {
      setStatus("redirecting");
      router.replace("/onboarding/register");
      return;
    }
    const { providerId: resolvedProviderId, sessionToken: resolvedSessionToken } = state;
    setProviderId(resolvedProviderId);
    setSessionToken(resolvedSessionToken);
    setAwaitingWebhook(new URLSearchParams(window.location.search).get("stripe") === "success");

    void (async () => {
      const result = await checkUploadPaymentStatus(resolvedProviderId, resolvedSessionToken);
      if (!result.success) {
        setError(result.error ?? t("checkError"));
        setStatus("unpaid");
        return;
      }
      setStatus(result.status === "confirmed" ? "confirmed" : result.status === "pending" ? "pending" : "unpaid");
    })();
  }, [router, t]);

  const handleSubmitTxId = async () => {
    if (!providerId || !sessionToken) return;
    setError(null);
    setSubmitting("usdc");
    const result = await submitUsdcPaymentClaim(providerId, sessionToken, txId, false);
    setSubmitting(null);
    if (result.success) {
      setStatus("pending");
    } else {
      setError(result.error ?? t("submitError"));
    }
  };

  const handleRequestInvoice = async () => {
    if (!providerId || !sessionToken) return;
    setError(null);
    setSubmitting("invoice");
    const result = await requestUploadInvoice(providerId, sessionToken, false);
    setSubmitting(null);
    if (result.success) {
      setStatus("pending");
    } else {
      setError(result.error ?? t("submitError"));
    }
  };

  /** Redirects to Stripe Checkout. The webhook (app/api/stripe/webhook)
   * writes the confirmed upload_payments row once Stripe reports the
   * payment succeeded — this tab won't see 'confirmed' until the provider
   * returns from Stripe and the gate re-checks status on next mount. */
  const handlePayByCard = async () => {
    if (!providerId || !sessionToken) return;
    setError(null);
    setSubmitting("card");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "upload_fee", providerId, sessionToken, pdfSurcharge: false }),
      });
      const data = (await res.json()) as { checkoutUrl?: string; message?: string };
      if (!res.ok || !data.checkoutUrl) {
        setSubmitting(null);
        setError(data.message ?? t("submitError"));
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setSubmitting(null);
      setError(t("submitError"));
    }
  };

  if (status === "checking") {
    return <p className="mt-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (status === "redirecting") {
    return <p className="mt-6 text-sm text-gray-500">{t("redirecting")}</p>;
  }
  if (status === "confirmed") {
    return <>{children}</>;
  }

  const collectionAddress = process.env.NEXT_PUBLIC_SBP_UPLOAD_FEE_WALLET;

  if (status === "unpaid" && awaitingWebhook) {
    return (
      <div className="mt-6 space-y-4">
        <Alert variant="info">{t("confirmingPayment")}</Alert>
        <button type="button" onClick={() => window.location.reload()} className="text-sm text-ocean underline">
          {t("refresh")}
        </button>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="mt-6 space-y-4">
        <Alert variant="info">{t("pendingNote")}</Alert>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6 rounded-lg border border-gray-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-semibold text-navy">{t("title")}</h2>
        <p className="mt-1 text-sm text-gray-600">{t("fee", { amount: UPLOAD_FEE_USDC.toFixed(2) })}</p>
      </div>

      <ul className="space-y-1 text-sm text-gray-600">
        <li>✓ {t("covers.formatting")}</li>
        <li>✓ {t("covers.security")}</li>
        <li>✓ {t("covers.review")}</li>
        <li>✓ {t("covers.registration")}</li>
      </ul>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-light-bg p-4">
        <h3 className="text-sm font-medium text-navy">{t("usdc.title")}</h3>
        {collectionAddress ? (
          <>
            <p className="text-sm text-gray-600">{t("usdc.instruction")}</p>
            <code className="block break-all rounded bg-white px-3 py-2 text-xs text-navy">{collectionAddress}</code>
            <label className="block text-sm text-gray-700">
              {t("usdc.txLabel")}
              <input
                type="text"
                value={txId}
                onChange={(e) => setTxId(e.target.value)}
                placeholder={t("usdc.txPlaceholder")}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-ocean focus:outline-none focus:ring-1 focus:ring-ocean"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleSubmitTxId()}
              disabled={txId.trim().length < 10 || submitting !== null}
              className="w-full rounded-md bg-ocean px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting === "usdc" ? t("submitting") : t("usdc.submit")}
            </button>
          </>
        ) : (
          <p className="text-sm text-gray-500">{t("usdc.notConfigured")}</p>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-navy">{t("card.title")}</h3>
        <p className="text-sm text-gray-600">{t("card.instruction")}</p>
        <button
          type="button"
          onClick={() => void handlePayByCard()}
          disabled={submitting !== null}
          className="w-full rounded-md border border-ocean px-4 py-2 text-sm font-medium text-ocean disabled:opacity-50"
        >
          {submitting === "card" ? t("submitting") : t("card.pay")}
        </button>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-navy">{t("invoice.title")}</h3>
        <p className="text-sm text-gray-600">{t("invoice.instruction")}</p>
        <button
          type="button"
          onClick={() => void handleRequestInvoice()}
          disabled={submitting !== null}
          className="w-full rounded-md border border-ocean px-4 py-2 text-sm font-medium text-ocean disabled:opacity-50"
        >
          {submitting === "invoice" ? t("submitting") : t("invoice.request")}
        </button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
