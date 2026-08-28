import { ProviderSidebar } from "@/components/nav/ProviderSidebar";
import { getResumedProvider } from "@/lib/onboarding/resume";
import { providerHasDeploymentInvoices } from "@/lib/dashboard/data";

/**
 * Session 20 — nests inside the (authenticated) group's layout.tsx (which
 * still provides GlobalNav/HeaderBand/PacificSidePanel/InstitutionalPanel
 * for every authenticated route), adding a persistent left nav scoped to
 * /dashboard/* only. GlobalNav hides its own authenticated nav links on
 * these routes (see GlobalNav.tsx) so this sidebar doesn't duplicate them.
 *
 * Session 37B — resolves getResumedProvider() a second time here (the
 * parent (authenticated)/layout.tsx already does it for GlobalNav): every
 * /dashboard/* page redirects unauthenticated visitors itself anyway, so an
 * unresolved provider here just means hasInvoices defaults to false, never
 * a broken render.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const resumed = await getResumedProvider();
  const hasInvoices = resumed ? await providerHasDeploymentInvoices(resumed.providerId) : false;

  return (
    <div className="flex min-h-full">
      <ProviderSidebar hasInvoices={hasInvoices} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
