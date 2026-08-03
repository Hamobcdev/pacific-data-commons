import { redirect } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { getResumedProvider } from "@/lib/onboarding/resume";
import { getDashboardData } from "@/lib/dashboard/data";
import { WalletPanel } from "@/components/dashboard/WalletPanel";
import { EarningsPanel } from "@/components/dashboard/EarningsPanel";
import { EndpointList } from "@/components/dashboard/EndpointList";

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
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
      <h1 className="text-3xl font-bold text-navy">{t("title")}</h1>
      <WalletPanel provider={data.provider} />
      <EarningsPanel provider={data.provider} transactions={data.recentTransactions} />
      <EndpointList endpoints={data.endpoints} />
    </div>
  );
}
