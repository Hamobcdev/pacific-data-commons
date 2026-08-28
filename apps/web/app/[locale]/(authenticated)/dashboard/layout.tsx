import { ProviderSidebar } from "@/components/nav/ProviderSidebar";

/**
 * Session 20 — nests inside the (authenticated) group's layout.tsx (which
 * still provides GlobalNav/HeaderBand/PacificSidePanel/InstitutionalPanel
 * for every authenticated route), adding a persistent left nav scoped to
 * /dashboard/* only. GlobalNav hides its own authenticated nav links on
 * these routes (see GlobalNav.tsx) so this sidebar doesn't duplicate them.
 *
 * Session 37B pre-merge fix: briefly resolved getResumedProvider() here to
 * conditionally show a "Deployment Invoices" link only once a provider had
 * at least one invoice — reverted, that link is now unconditional (see
 * ProviderSidebar.tsx), so this layout no longer needs its own data fetch.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <ProviderSidebar />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
