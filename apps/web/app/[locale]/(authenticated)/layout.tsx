import { getResumedProvider } from "@/lib/onboarding/resume";
import { GlobalNav } from "@/components/nav/GlobalNav";
import { GlobalFooter } from "@/components/nav/GlobalFooter";
import { HeaderBand } from "@/components/layout/HeaderBand";
import { PacificSidePanel } from "@/components/layout/PacificSidePanel";
import { InstitutionalPanel } from "@/components/register/InstitutionalPanel";

/**
 * Shell for every authenticated-surface route (Session 12) — currently
 * /dashboard and /data/[providerSlug]/[datasetSlug]. This route group
 * (parentheses folder) is transparent to the URL, so moving those pages in
 * here does not change their paths.
 *
 * getResumedProvider() (lib/onboarding/resume.ts) is the same
 * Supabase-Auth-cookie -> providers.contact_email lookup the dashboard page
 * itself already used pre-move — reused here so the nav can render its
 * authenticated links (or the guest Register CTA) without every page under
 * this group re-deriving the same auth state.
 *
 * Session 12 fix: three-column body (Pacific side panel, centre content,
 * InstitutionalPanel) — both side columns are `hidden xl:flex`, so laptop
 * widths (1024-1279px) and everything below get the full-width single
 * column this shell shipped with originally.
 */
export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const provider = await getResumedProvider();

  return (
    <div className="min-h-screen flex flex-col">
      <GlobalNav provider={provider} />
      <HeaderBand />

      <div className="flex flex-1 min-h-0">
        <PacificSidePanel side="left" />

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>

        <aside
          className="hidden xl:flex flex-col flex-shrink-0 w-48 2xl:w-56
            sticky top-14 h-[calc(100vh-56px)] overflow-hidden border-l border-gray-100"
        >
          <InstitutionalPanel />
        </aside>
      </div>

      <GlobalFooter />
    </div>
  );
}
