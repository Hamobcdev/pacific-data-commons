import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AgentOutput } from "@pdc/shared-types";

export function DryRunPreview({
  preview,
  onConfirm,
  onCancel,
  isSubmitting,
}: {
  preview: NonNullable<AgentOutput["preview"]>;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const t = useTranslations("AgentMarketplace");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dry_run_title")}</CardTitle>
        <p className="mt-1 text-sm text-gray-600">{t("dry_run_subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {preview.endpoints_to_query.map((endpoint) => (
            <li key={endpoint.endpoint_id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="font-medium text-navy">{endpoint.title}</p>
                <p className="text-gray-500">{endpoint.reason}</p>
              </div>
              <span className="font-medium text-navy">${endpoint.price_usdc.toFixed(2)}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between rounded-md bg-light-bg p-3 text-sm font-medium text-navy">
          <span>Estimated cost</span>
          <span>${preview.estimated_cost_usdc.toFixed(2)} USDC</span>
        </div>

        <p className="text-xs text-gray-500">{preview.output_shape}</p>

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? t("running") : t("confirm_run")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
