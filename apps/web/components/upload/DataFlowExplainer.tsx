"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const STEP_KEYS = ["dataStaysWithYou", "weStructureIt", "buyersQuery", "revenueShare"] as const;
const STEP_ICONS: Record<(typeof STEP_KEYS)[number], string> = {
  dataStaysWithYou: "🏛️",
  weStructureIt: "🤖",
  buyersQuery: "🔗",
  revenueShare: "💰",
};

/**
 * Session 28, Deliverable 6 — "what happens to our data?" is the question
 * a first-time institutional provider (e.g. NUS) asks before uploading
 * anything, not after. Collapsed by default so it doesn't compete with the
 * upload form for attention, but visible above it regardless of payment/
 * founding-partner gate state — see upload/page.tsx placement, deliberately
 * outside UploadPaymentGate.
 */
export function DataFlowExplainer() {
  const t = useTranslations("Onboarding.Upload.dataFlow");
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-ocean"
      >
        <span>{t("toggle")}</span>
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-100 px-4 py-4">
          {STEP_KEYS.map((key) => (
            <div key={key} className="flex gap-3">
              <span className="text-xl" aria-hidden="true">
                {STEP_ICONS[key]}
              </span>
              <div>
                <p className="text-sm font-medium text-navy">{t(`steps.${key}.title`)}</p>
                <p className="mt-0.5 text-sm text-gray-600">{t(`steps.${key}.body`)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
