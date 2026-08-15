import { redirect } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { getResumedProvider } from "@/lib/onboarding/resume";
import { getOwnedEndpoint, getEndpointVersions } from "@/lib/dashboard/versions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { VersionHistoryTimeline } from "@/components/dashboard/VersionHistoryTimeline";

/**
 * Session 18 (Deliverable 5) — provider-facing timeline. Same data
 * (endpoint_versions) as the public tab (Deliverable 6), but this view adds
 * nothing providers alone should see beyond what's already public (version
 * history is transparent, P7) — the only difference from the public tab is
 * the "Declare an update" call to action.
 */
export default async function VersionHistoryPage({ params }: { params: { locale: string; endpointId: string } }) {
  const { locale, endpointId } = params;
  const t = await getTranslations("DeclareUpdate.versions");
  const resumed = await getResumedProvider();
  if (!resumed) {
    return redirect({ href: "/onboarding/register", locale });
  }

  const endpoint = await getOwnedEndpoint(resumed.providerId, endpointId);
  if (!endpoint) {
    return redirect({ href: "/dashboard", locale });
  }

  const versions = await getEndpointVersions(endpointId);

  return (
    <div className="px-6 py-8 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
          <p className="text-sm text-gray-500">{endpoint.title}</p>
        </div>
        {!endpoint.pending_recertification && (
          <Link href={`/dashboard/endpoints/${endpointId}/update`}>
            <Button type="button" variant="secondary">
              {t("declareButton")}
            </Button>
          </Link>
        )}
      </div>

      {endpoint.pending_recertification && (
        <Badge variant="warning">{t("pendingBadge", { version: endpoint.version_number + 1 })}</Badge>
      )}

      <VersionHistoryTimeline versions={versions} currentVersionNumber={endpoint.version_number} />
    </div>
  );
}
