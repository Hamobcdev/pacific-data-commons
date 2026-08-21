"use client";

import { useTranslations } from "next-intl";

/**
 * Session 28 — replaces UploadPaymentGate's $25 payment gate entirely for
 * founding_partner providers with quota remaining (Decision 27 extended).
 * Teal/green accent deliberately, not the gate's neutral/error palette —
 * this is good news, not a wall. See UploadPaymentGate.tsx for the
 * eligibility check this renders in response to.
 */
export function FoundingPartnerWelcome({ remaining, limit }: { remaining: number; limit: number }) {
  const t = useTranslations("Onboarding.Upload.foundingPartner");

  return (
    <div className="space-y-4 rounded-lg border border-pacific-green/30 bg-pacific-green/5 p-6">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-pacific-green/15 px-2.5 py-0.5 text-xs font-medium text-pacific-green-dark">
          🌊 {t("badge")}
        </span>
      </div>
      <h3 className="text-lg font-semibold text-navy">{t("title")}</h3>

      <p className="text-sm text-gray-700">{t("message", { limit, remaining })}</p>

      <ul className="space-y-1 text-sm text-gray-600">
        <li>✓ {t("includes.formatting")}</li>
        <li>✓ {t("includes.security")}</li>
        <li>✓ {t("includes.reviewAndRegistration")}</li>
        <li>✓ {t("includes.listed")}</li>
      </ul>

      {/* Honest USDC note — CLAUDE.md §15, never imply easy conversion */}
      <p className="text-xs text-gray-500">{t("usdcNote")}</p>
    </div>
  );
}
