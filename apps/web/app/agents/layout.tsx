import { getTranslations } from "next-intl/server";
import Link from "next/link";

/**
 * Agents section shell — scaffold only (Session 6.1). The real marketplace
 * UI, agent cards, and the bidirectional-wallet dashboard view are Session
 * 7. This just gives the /agents route tree somewhere to live so it exists
 * without 404s and the routing structure is already correct for Session 7
 * to build into. Mirrors the onboarding layout's simple header + footer
 * shell (apps/web/app/onboarding/layout.tsx) rather than inventing a
 * different pattern for a second top-level section.
 */
export default async function AgentsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Agents.nav");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/agents" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-navy rounded" aria-hidden="true" />
            <span className="font-semibold text-navy text-sm">Pacific Data Commons</span>
          </Link>
          <span className="text-xs text-gray-500">{t("label")}</span>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
