"use client";

import { useTranslations } from "next-intl";
import type { OriginalUploadSummary } from "@/actions/onboarding/save-review";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export interface OriginalSummaryPanelProps {
  uploads: OriginalUploadSummary[];
  loading: boolean;
}

/** Left panel — read-only summary of what the provider actually uploaded in
 * Step 3. Never editable: this is the "what you gave us" record, the right
 * panel is "what we're proposing to list." */
export function OriginalSummaryPanel({ uploads, loading }: OriginalSummaryPanelProps) {
  const t = useTranslations("Onboarding.Review.original");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-gray-400">{t("loading")}</p>}
        {!loading && uploads.length === 0 && <p className="text-gray-400">{t("empty")}</p>}
        {!loading && uploads.length > 0 && (
          <ul className="space-y-4">
            {uploads.map((file) => (
              <li key={file.filename} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                <p className="font-medium text-navy break-all">{file.filename}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-gray-500">
                  <dt>{t("format")}</dt>
                  <dd className="text-gray-700">{file.fileType}</dd>
                  <dt>{t("fieldCount")}</dt>
                  <dd className="text-gray-700">{file.fieldCount ?? t("fieldCountUnavailable")}</dd>
                  <dt>{t("uploadedAt")}</dt>
                  <dd className="text-gray-700">{new Date(file.uploadedAt).toLocaleString()}</dd>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
