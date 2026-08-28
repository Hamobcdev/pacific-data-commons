"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Session 20 — persistent left nav for authenticated provider pages,
 * replacing GlobalNav's authenticated-only links (see GlobalNav.tsx's
 * pathname check) so the same five destinations aren't offered twice.
 * Reuses the "Nav" translation namespace rather than duplicating labels
 * SBP has already translated once (Decision 9).
 *
 * Deliberately limited to routes that exist today — the brief's original
 * sketch included /dashboard/earnings, /dashboard/transactions, and
 * /dashboard/settings, none of which are built yet (P5: no placeholders,
 * a sidebar link to a 404 is worse than no link).
 */
const ITEMS = [
  { key: "dashboard", href: "/dashboard", icon: "📊" },
  { key: "addDataset", href: "/onboarding/new-dataset", icon: "➕" },
  { key: "browseData", href: "/data", icon: "🔗" },
  { key: "agents", href: "/agents", icon: "🤖" },
  { key: "walletSettings", href: "/onboarding/wallet", icon: "💰" },
  { key: "faq", href: "/faq", icon: "❓" },
] as const;

/** Session 37B — "Deployment Invoices" isn't in the translated Nav
 * namespace (hardcoded label, matching the Deploy step's own new copy) and
 * is conditionally rendered rather than a static ITEMS entry: unlike every
 * other destination here, a provider with zero deployment_invoices rows
 * would only ever see an empty table, so it's hidden until they have at
 * least one (see dashboard/layout.tsx's providerHasDeploymentInvoices
 * check). */
export interface ProviderSidebarProps {
  hasInvoices?: boolean;
}

export function ProviderSidebar({ hasInvoices = false }: ProviderSidebarProps) {
  const t = useTranslations("Nav");
  const pathname = usePathname();

  const invoicesActive = pathname.startsWith("/dashboard/invoices");

  return (
    <nav
      aria-label={t("dashboard")}
      className="flex-shrink-0 w-14 sm:w-48 border-r border-gray-100 py-6 px-2 sm:px-3"
    >
      <ul className="space-y-1">
        {ITEMS.map((item) => {
          const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm min-h-[44px] sm:min-h-0 transition-colors ${
                  active ? "bg-ocean/10 text-ocean font-medium" : "text-gray-600 hover:bg-gray-50 hover:text-navy"
                }`}
              >
                <span aria-hidden="true">{item.icon}</span>
                <span className="hidden sm:inline">{t(item.key)}</span>
              </Link>
            </li>
          );
        })}
        {hasInvoices && (
          <li>
            <Link
              href="/dashboard/invoices"
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm min-h-[44px] sm:min-h-0 transition-colors ${
                invoicesActive ? "bg-ocean/10 text-ocean font-medium" : "text-gray-600 hover:bg-gray-50 hover:text-navy"
              }`}
            >
              <span aria-hidden="true">🧾</span>
              <span className="hidden sm:inline">Deployment Invoices</span>
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
