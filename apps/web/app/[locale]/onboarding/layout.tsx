import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ErrorBoundary } from "@/components/onboarding/ErrorBoundary";
import { HeaderBand } from "@/components/layout/HeaderBand";
import { PacificSidePanel } from "@/components/layout/PacificSidePanel";
import { InstitutionalPanel } from "@/components/register/InstitutionalPanel";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Onboarding.shell");
  const tError = await getTranslations("Onboarding.error");

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Session 12 fix: the narrow canoe header band this shell shipped
          with is gone — the canoe image now lives in PacificSidePanel for
          register/wallet, and this uses the same HeaderBand every other
          shell uses. The brand text is a real Link now (bug #1 — it was
          a plain <span>, not clickable, before this fix). */}
      <HeaderBand>
        <div className="flex items-center justify-between h-full px-4 max-w-2xl mx-auto w-full">
          <Link href="/" className="text-white text-sm font-medium hover:opacity-80 transition-opacity">
            {t("brand")}
          </Link>
          <span className="text-white/60 text-sm">{t("sectionLabel")}</span>
        </div>
      </HeaderBand>

      <div className="flex flex-1 min-h-0">
        <PacificSidePanel side="left" />

        <main className="flex-1 min-w-0 overflow-y-auto max-w-2xl mx-auto px-4 py-8">
          <ErrorBoundary title={tError("title")} description={tError("description")} reloadLabel={tError("reload")}>
            {children}
          </ErrorBoundary>
        </main>

        <aside
          className="hidden xl:flex flex-col flex-shrink-0 w-48 2xl:w-56
            sticky top-0 h-screen overflow-hidden border-l border-gray-100"
        >
          <InstitutionalPanel />
        </aside>
      </div>

      <footer className="border-t border-gray-200 py-6">
        <div className="max-w-2xl mx-auto px-4">
          <p className="text-xs text-gray-400 text-center">{t("footerNotice")}</p>
        </div>
      </footer>
    </div>
  );
}
