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
  // Session 37B pre-merge fix: placed after "Add Dataset" rather than
  // between it and "Dashboard" — groups naturally with the
  // add-a-dataset/deploy-it lifecycle rather than breaking the
  // primary-landing-page adjacency at the top. Not in the translated Nav
  // namespace — `label` overrides `t(key)` below, hardcoded like the
  // Deploy step's own Session 37B copy. Unconditional (unlike this
  // component's brief Session 37B iteration, which gated it on the
  // provider having at least one invoice) — every authenticated provider
  // sees it, same as every other item here.
  { key: "deploymentInvoices", href: "/dashboard/invoices", icon: "🧾", label: "Deployment Invoices" },
  { key: "browseData", href: "/data", icon: "🔗" },
  { key: "agents", href: "/agents", icon: "🤖" },
  { key: "walletSettings", href: "/onboarding/wallet", icon: "💰" },
  { key: "faq", href: "/faq", icon: "❓" },
] as const;

/**
 * Session 20 (see file header) — persistent left nav for authenticated
 * provider pages.
 */
export function ProviderSidebar() {
  const t = useTranslations("Nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("dashboard")}
      className="flex-shrink-0 w-14 sm:w-48 border-r border-gray-100 py-6 px-2 sm:px-3"
    >
      <ul className="space-y-1">
        {ITEMS.map((item) => {
          const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
          const label = "label" in item ? item.label : t(item.key);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm min-h-[44px] sm:min-h-0 transition-colors ${
                  active ? "bg-ocean/10 text-ocean font-medium" : "text-gray-600 hover:bg-gray-50 hover:text-navy"
                }`}
              >
                <span aria-hidden="true">{item.icon}</span>
                <span className="hidden sm:inline">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
