import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Endpoint } from "@pdc/shared-types";

const HEALTH_VARIANT = { healthy: "success", degraded: "warning", down: "error", unknown: "neutral" } as const;

export async function EndpointList({ endpoints }: { endpoints: Endpoint[] }) {
  const t = await getTranslations("Dashboard");

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
              <li key={endpoint.id} className="flex items-center justify-between gap-3 py-3 text-sm">
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
              </li>
            ))}
          </ul>
        )}
        {/* Edit-endpoint UI is Session 8 — this list is read-only for now. */}
      </CardContent>
    </Card>
  );
}
