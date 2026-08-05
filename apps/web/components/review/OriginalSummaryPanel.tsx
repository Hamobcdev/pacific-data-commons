"use client";

import { useTranslations } from "next-intl";
import type { OriginalUploadSummary } from "@/actions/onboarding/save-review";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
        {loading && (
          <div className="space-y-4" aria-busy="true" aria-label={t("loading")}>
            {[0, 1].map((i) => (
              <div key={i} className="space-y-2 border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                <Skeleton className="h-4 w-3/4" />
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-10" />
                </div>
              </div>
            ))}
          </div>
        )}
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
