import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShareButtons } from "@/components/ui/ShareButtons";
import { slugify } from "@/lib/onboarding/slug";
import type { Endpoint } from "@pdc/shared-types";

const HEALTH_VARIANT = { healthy: "success", degraded: "warning", down: "error", unknown: "neutral" } as const;

export interface EndpointListProps {
  endpoints: Endpoint[];
  providerSlug: string;
  providerName: string;
}

export async function EndpointList({ endpoints, providerSlug, providerName }: EndpointListProps) {
  const t = await getTranslations("Dashboard");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("endpoints_title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {endpoints.length === 0 ? (
          <p className="text-sm text-gray-500">No endpoints yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="flex flex-col gap-2 py-3 text-base">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-navy">{endpoint.title}</p>
                    <p className="text-gray-500">
                      {endpoint.data_category} · {endpoint.is_active ? "Active" : "Paused"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-navy">${endpoint.total_revenue_usdc.toFixed(2)}</span>
                    <Badge variant={HEALTH_VARIANT[endpoint.health_status]}>{endpoint.health_status}</Badge>
                  </div>
                </div>
                {endpoint.is_active && (
                  <ShareButtons
                    datasetName={endpoint.title}
                    providerName={providerName}
                    datasetUrl={`${appUrl}/data/${providerSlug}/${slugify(endpoint.title)}`}
                    pricePerQuery={`$${(endpoint.pricing_tiers[0]?.price_usdc ?? 0.01).toFixed(2)}`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {/* Edit-endpoint UI is Session 8 — this list is read-only for now. */}
      </CardContent>
    </Card>
  );
}
