import { redirect } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { getResumedProvider } from "@/lib/onboarding/resume";
import { getDashboardData } from "@/lib/dashboard/data";
import { WalletPanel } from "@/components/dashboard/WalletPanel";
import { EarningsPanel } from "@/components/dashboard/EarningsPanel";
import { EndpointList } from "@/components/dashboard/EndpointList";
import { TrustTierProgress } from "@/components/dashboard/TrustTierProgress";
import { slugify } from "@/lib/onboarding/slug";

/**
 * Provider dashboard (Deliverable 8) — replaces the Session 6.1 scaffold
 * that unconditionally redirected to /onboarding/register. Auth reuses
 * getResumedProvider() (lib/onboarding/resume.ts), the same Supabase
 * magic-link session -> providers.contact_email match the onboarding
 * resume flow already established — no new auth mechanism introduced.
 */
export default async function DashboardPage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const t = await getTranslations("Dashboard");
  const resumed = await getResumedProvider();
  if (!resumed) {
    return redirect({ href: "/onboarding/register", locale });
  }

  const data = await getDashboardData(resumed.providerId);
  if (!data) {
    return redirect({ href: "/onboarding/register", locale });
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Left panel — coral reef image (Session 12). Desktop only, matching
          the InstitutionalPanel pattern already used on the registration
          page: a fixed-width column that fills whatever height its parent
          gives it, not a self-positioning fixed/absolute element. */}
      <aside className="hidden lg:block w-80 xl:w-96 flex-shrink-0 relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/images/panel-dashboard-reef.webp')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-pacific-shell-dark/60 to-transparent" />
        <div className="absolute bottom-8 left-6 right-6">
          <p className="text-white font-medium text-sm leading-relaxed">{t("sovereigntyHeadline")}</p>
          <p className="text-white/60 text-xs mt-1">{t("sovereigntyBody")}</p>
        </div>
      </aside>

      {/* Existing dashboard content — unchanged */}
      <main className="flex-1 max-w-3xl mx-auto px-4 py-10 space-y-6">
        <h1 className="text-3xl font-bold text-navy">{t("title")}</h1>
        <WalletPanel provider={data.provider} />
        <EarningsPanel provider={data.provider} transactions={data.recentTransactions} />
        <TrustTierProgress provider={data.provider} bestUpvoteCount={data.bestUpvoteCount} />
        <EndpointList endpoints={data.endpoints} providerSlug={slugify(data.provider.institution_name)} providerName={data.provider.institution_name} />
      </main>
    </div>
  );
}
