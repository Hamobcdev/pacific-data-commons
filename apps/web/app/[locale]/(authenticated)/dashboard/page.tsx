import { redirect, Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { getResumedProvider } from "@/lib/onboarding/resume";
import { getDashboardData } from "@/lib/dashboard/data";
import { WalletPanel } from "@/components/dashboard/WalletPanel";
import { EarningsPanel } from "@/components/dashboard/EarningsPanel";
import { EndpointList } from "@/components/dashboard/EndpointList";
import { TrustTierProgress } from "@/components/dashboard/TrustTierProgress";
import { Button } from "@/components/ui/button";
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
    // Session 12 fix: the page's own coral-reef aside is gone — the
    // (authenticated) layout now renders a route-aware Pacific side panel
    // for every page in this group (PacificSidePanel), so this page's own
    // copy would have doubled up the same image. `mx-auto` is dropped too;
    // the layout's flex row already centres this column between the two
    // side panels, so centring again here just fought that.
    <div className="px-6 py-8 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-navy">{t("title")}</h1>
        {/* Session 19, Fix 5 — moved here from the top-level nav (was
            "Add Dataset" in GlobalNav): a provider action, not a
            directory-wide nav concern. */}
        <Link href="/onboarding/new-dataset">
          <Button type="button" className="min-h-[44px]">
            {t("add_dataset")}
          </Button>
        </Link>
      </div>
      <WalletPanel provider={data.provider} />
      <EarningsPanel provider={data.provider} transactions={data.recentTransactions} />
      <TrustTierProgress provider={data.provider} bestUpvoteCount={data.bestUpvoteCount} />
      <EndpointList
        endpoints={data.endpoints}
        providerSlug={slugify(data.provider.institution_name)}
        providerName={data.provider.institution_name}
        latestCertifiedAtByEndpointId={data.latestCertifiedAtByEndpointId}
      />
    </div>
  );
}
