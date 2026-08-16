import { redirect } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { getResumedProvider } from "@/lib/onboarding/resume";
import { getOwnedEndpoint, getPendingVersion, getEligibleNotificationCount } from "@/lib/dashboard/versions";
import { createServiceClient } from "@/lib/supabase/server";
import { DeclareUpdateWizard } from "@/components/dashboard/DeclareUpdateWizard";
import { Breadcrumb } from "@/components/nav/Breadcrumb";

/**
 * Session 18 (Deliverable 4). There is no pre-existing endpoint management
 * page this extends — apps/web/components/dashboard/EndpointList.tsx's own
 * comment says "Edit-endpoint UI is Session 8" (never built), so this is a
 * new route tree, not an extension of something already there.
 */
export default async function DeclareUpdatePage({ params }: { params: { locale: string; endpointId: string } }) {
  const { locale, endpointId } = params;
  const t = await getTranslations("DeclareUpdate");
  const tNav = await getTranslations("Nav");
  const tDashboard = await getTranslations("Dashboard");
  const resumed = await getResumedProvider();
  if (!resumed) {
    return redirect({ href: "/onboarding/register", locale });
  }

  const endpoint = await getOwnedEndpoint(resumed.providerId, endpointId);
  if (!endpoint) {
    return redirect({ href: "/dashboard", locale });
  }

  const supabase = createServiceClient();
  const { data: providerRow } = await supabase.from("providers").select("institution_name").eq("id", resumed.providerId).maybeSingle();
  const institutionName = (providerRow as { institution_name: string } | null)?.institution_name ?? "";

  const [pendingVersion, notifiedCount] = await Promise.all([
    endpoint.pending_recertification ? getPendingVersion(endpointId) : Promise.resolve(null),
    getEligibleNotificationCount(endpointId),
  ]);

  return (
    <div className="px-6 py-8 space-y-4 max-w-3xl">
      <Breadcrumb
        items={[
          { label: tNav("dashboard"), href: "/dashboard" },
          { label: tDashboard("endpoints_title"), href: "/dashboard" },
          { label: endpoint.title, href: `/dashboard/endpoints/${endpointId}/versions` },
          { label: t("pageTitle") },
        ]}
      />
      <div>
        <h1 className="text-2xl font-bold text-navy">{t("pageTitle")}</h1>
        <p className="text-sm text-gray-500">{endpoint.title}</p>
      </div>
      <DeclareUpdateWizard
        endpointId={endpointId}
        endpointTitle={endpoint.title}
        institutionName={institutionName}
        notifiedCount={notifiedCount}
        pending={
          endpoint.pending_recertification && pendingVersion
            ? {
                versionId: pendingVersion.id,
                versionNumber: pendingVersion.version_number,
                pendingSince: endpoint.pending_recertification_since ?? pendingVersion.declared_at,
              }
            : null
        }
      />
    </div>
  );
}
