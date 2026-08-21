"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const DISMISS_KEY = "pdc-founding-partner-banner-dismissed";

/**
 * Session 28, Deliverable 5 — shown at the top of the dashboard for
 * founding_partner providers who still have free-dataset quota. Dismissal
 * is UX-only (localStorage), never written to Supabase — a provider who
 * dismisses it still sees FoundingPartnerWelcome on /onboarding/upload
 * itself, so nothing about their actual entitlement depends on this flag.
 * Eligibility (founding_partner && quota remaining) is computed server-side
 * in dashboard/page.tsx — this component only decides whether to render
 * given `remaining`, and whether the visitor already dismissed it.
 */
export function FoundingPartnerDashboardBanner({ remaining }: { remaining: number }) {
  const t = useTranslations("Dashboard.foundingPartnerBanner");
  const [dismissed, setDismissed] = useState(true); // default hidden until localStorage check runs (no SSR flash)

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "true");
  }, []);

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  };

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-pacific-green/30 bg-pacific-green/5 px-4 py-3">
      <div>
        <strong className="text-sm text-navy">🌊 {t("title")}</strong>
        <p className="mt-1 text-sm text-gray-600">{t("message", { remaining })}</p>
        <Link href="/onboarding/new-dataset" className="mt-2 inline-block text-sm font-medium text-pacific-green-dark hover:underline">
          {t("cta")} →
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("dismiss")}
        className="flex-shrink-0 text-lg leading-none text-gray-400 hover:text-gray-600"
      >
        ×
      </button>
    </div>
  );
}
