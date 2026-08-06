import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

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
      {/* Night-islands header band (Session 12) — background image added
          behind the existing header content, which is otherwise untouched
          apart from switching its text/link colours to white for contrast
          against the darkened photo. */}
      <header className="relative overflow-hidden border-b border-white/10">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/images/panel-agents-night-islands.webp')" }}
        />
        <div className="absolute inset-0 bg-pacific-shell-dark/70" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 py-6 flex items-center justify-between">
          <Link href="/agents" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/90 rounded" aria-hidden="true" />
            <span className="font-semibold text-white text-sm">Pacific Data Commons</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-xs text-white/70 hover:text-white">
              Provider Dashboard
            </Link>
            <span className="text-xs text-white/70">{t("label")}</span>
          </div>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
