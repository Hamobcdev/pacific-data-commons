import { getResumedProvider } from "@/lib/onboarding/resume";
import { GlobalNav } from "@/components/nav/GlobalNav";
import { GlobalFooter } from "@/components/nav/GlobalFooter";

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
 */
export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const provider = await getResumedProvider();

  return (
    <div className="min-h-screen flex flex-col">
      <GlobalNav provider={provider} />
      <main className="flex-1">{children}</main>
      <GlobalFooter />
    </div>
  );
}
