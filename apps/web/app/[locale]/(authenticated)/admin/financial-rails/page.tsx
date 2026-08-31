import { redirect } from "@/i18n/navigation";
import { isAdminSession } from "@/lib/admin/access";
import { getReservesSummary, getProvidersStatus, getCbsOversightEcosystem, getComplianceFlags, getPlatformNodes } from "@/lib/admin/financialRails";
import { StubStatusBanner } from "@/components/admin/StubStatusBanner";
import { EcosystemOverview } from "@/components/admin/EcosystemOverview";
import { MonetaryHierarchy } from "@/components/admin/MonetaryHierarchy";
import { PlatformNodesTable } from "@/components/admin/PlatformNodesTable";
import { PaymentProvidersTable } from "@/components/admin/PaymentProvidersTable";
import { ComplianceFlagsTable } from "@/components/admin/ComplianceFlagsTable";

/**
 * CBS Financial Rails oversight dashboard (Session 39, Component B).
 * Deliberately not linked from ProviderSidebar or GlobalNav — access is by
 * direct URL only, gated by isAdminSession() (ADMIN_EMAIL match). This is
 * an SBP operator dashboard, not a provider-facing feature, so it skips
 * next-intl (no other admin surface in this app is translated either) and
 * the (authenticated) layout's Pacific side panels still render around it
 * since it lives in the same route group — acceptable for a stub-stage
 * internal tool, revisit if this page graduates out of the (authenticated)
 * group later.
 */
export default async function FinancialRailsAdminPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { type?: string; status?: string };
}) {
  const { locale } = params;
  const admin = await isAdminSession();
  if (!admin) {
    return redirect({ href: "/dashboard", locale });
  }

  const [reserves, providersResult, ecosystem, complianceFlags, platformNodes] = await Promise.all([
    getReservesSummary(),
    getProvidersStatus(),
    getCbsOversightEcosystem(),
    getComplianceFlags(),
    getPlatformNodes(),
  ]);

  const allProviders = providersResult.data?.providers ?? [];
  const selectedType = searchParams.type ?? "";
  const selectedStatus = searchParams.status ?? "";
  const filteredProviders = allProviders.filter(
    (p) => (selectedType === "" || p.provider_type === selectedType) && (selectedStatus === "" || p.status === selectedStatus),
  );
  const allTypes = Array.from(new Set(allProviders.map((p) => p.provider_type))).sort();
  const allStatuses = Array.from(new Set(allProviders.map((p) => p.status))).sort();

  const nodes = platformNodes.data?.platform_nodes ?? [];
  const activeNodeCount = nodes.filter((n) => n.status.startsWith("live") || n.status === "built_pilot_ready").length;

  return (
    <div className="px-6 py-8 space-y-6 max-w-5xl">
      <h1 className="text-3xl font-bold text-navy">CBS Financial Rails</h1>

      <StubStatusBanner />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-navy">Ecosystem Overview</h2>
        <EcosystemOverview
          activeNodeCount={platformNodes.data ? activeNodeCount : null}
          totalNodeCount={platformNodes.data?.ecosystem_summary.total_nodes ?? null}
          activeProviders={reserves.data?.active_providers ?? null}
          stubProviders={reserves.data?.stub_providers ?? null}
          totalChecks={ecosystem.data?.compliance_summary.total_checks ?? null}
          flaggedChecks={ecosystem.data?.compliance_summary.flagged_pending_cbs_review ?? null}
          clearedChecks={ecosystem.data?.compliance_summary.cleared ?? null}
          reserveUsdc={reserves.data?.total_usdc_in_ecosystem ?? null}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-navy">Monetary Authority Hierarchy</h2>
        <MonetaryHierarchy
          tier2Members={ecosystem.data?.hierarchy.tier_2_commercial_banks ?? []}
          tier3Members={ecosystem.data?.hierarchy.tier_3_mobile_money ?? []}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-navy">Platform Nodes</h2>
        {platformNodes.error && <p className="text-sm text-red-600">{platformNodes.error}</p>}
        <PlatformNodesTable nodes={nodes} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-navy">Payment Providers</h2>
        {providersResult.error && <p className="text-sm text-red-600">{providersResult.error}</p>}
        <PaymentProvidersTable providers={filteredProviders} allTypes={allTypes} allStatuses={allStatuses} selectedType={selectedType} selectedStatus={selectedStatus} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-navy">Compliance Flags</h2>
        {complianceFlags.error && <p className="text-sm text-red-600">{complianceFlags.error}</p>}
        <ComplianceFlagsTable flags={complianceFlags.data?.flags ?? []} />
      </section>
    </div>
  );
}
