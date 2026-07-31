import { getTranslations } from "next-intl/server";
import Link from "next/link";

/**
 * Agents section shell — full marketplace layout (Session 7; Session 6.1
 * left this as a scaffold with no dashboard link since /dashboard didn't
 * exist yet). Mirrors the onboarding layout's simple header + footer shell
 * (apps/web/app/onboarding/layout.tsx) rather than inventing a different
 * pattern for a second top-level section.
 */
export default async function AgentsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Agents.nav");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/agents" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-navy rounded" aria-hidden="true" />
            <span className="font-semibold text-navy text-sm">Pacific Data Commons</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-xs text-gray-500 hover:text-navy">
              Provider Dashboard
            </Link>
            <span className="text-xs text-gray-500">{t("label")}</span>
          </div>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
