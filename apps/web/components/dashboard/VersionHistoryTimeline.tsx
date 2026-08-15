import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EndpointVersion } from "@pdc/shared-types";

const CATEGORY_ICON: Record<string, string> = { additive: "➕", correction: "✏️", expansion: "📊", methodology_change: "🔬", initial_certification: "🏅" };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export interface VersionHistoryTimelineProps {
  versions: EndpointVersion[];
  currentVersionNumber: number;
}

/**
 * Session 18 (Deliverables 5 + 6) — shared between the provider dashboard's
 * version history page and the public dataset detail page's Version
 * History section, since both show the exact same underlying data
 * (version history is transparent, P7) with only the provider page adding
 * a "Declare an update" call to action around this component.
 */
export async function VersionHistoryTimeline({ versions, currentVersionNumber }: VersionHistoryTimelineProps) {
  const t = await getTranslations("DeclareUpdate.versions");

  if (versions.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-gray-500">{t("empty")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ol className="space-y-4">
      {versions.map((version) => {
        const isCurrent = version.version_number === currentVersionNumber && !!version.certified_at;
        return (
          <li key={version.id}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>●</span>
                  <span>
                    {t("versionLabel", { version: version.version_number })}
                    {isCurrent ? ` — ${t("current")}` : ""}
                  </span>
                  <span className="ml-auto text-xs font-normal text-gray-500">
                    {version.certified_at ? t("certifiedOn", { date: formatDate(version.certified_at) }) : t("pending")}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="font-medium text-navy">
                  {CATEGORY_ICON[version.update_category] ?? ""} {t(`category.${version.update_category}`)}
                </p>
                <p className="italic text-gray-600">&ldquo;{version.provider_change_description}&rdquo;</p>
                <p className="text-xs text-gray-500">
                  {version.records_added > 0 && `+${version.records_added} ${t("records")}`}
                  {version.records_added > 0 && (version.records_modified > 0 || version.certified_at) ? " · " : ""}
                  {version.records_modified > 0 && `${version.records_modified} ${t("modified")}`}
                  {version.records_modified > 0 && version.certified_at ? " · " : ""}
                  {version.certified_at && (version.certified_by === "sbp_human" ? t("sbpReviewed") : t("autoCertified"))}
                  {version.certified_at && version.notification_count > 0 ? " · " : ""}
                  {version.notification_count > 0 && t("notified", { count: version.notification_count })}
                </p>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
