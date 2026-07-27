import { getTranslations } from "next-intl/server";
import { ErrorBoundary } from "@/components/onboarding/ErrorBoundary";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Onboarding.shell");
  const tError = await getTranslations("Onboarding.error");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simple header — logo + step name only, no distraction (R6) */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-navy rounded" aria-hidden="true" />
            <span className="font-semibold text-navy text-sm">{t("brand")}</span>
          </div>
          <span className="text-xs text-gray-500">{t("sectionLabel")}</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <ErrorBoundary title={tError("title")} description={tError("description")} reloadLabel={tError("reload")}>
          {children}
        </ErrorBoundary>
      </main>

      <footer className="mt-16 border-t border-gray-200 py-6">
        <div className="max-w-2xl mx-auto px-4">
          <p className="text-xs text-gray-400 text-center">{t("footerNotice")}</p>
        </div>
      </footer>
    </div>
  );
}
