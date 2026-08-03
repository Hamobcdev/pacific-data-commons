"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShareButtons } from "@/components/ui/ShareButtons";
import { slugify } from "@/lib/onboarding/slug";

export interface CompletionCardProps {
  institutionName: string;
  datasetTitle: string;
  providerSlug: string;
}

/** Congratulations card + copyable listing URL. The listing URL is
 * inactive until SBP review completes (CLAUDE.md Decision 1 — domain is
 * still TBD, so this reads from NEXT_PUBLIC_DIRECTORY_DOMAIN with a
 * placeholder fallback rather than a hardcoded real domain). */
export function CompletionCard({ institutionName, datasetTitle, providerSlug }: CompletionCardProps) {
  const t = useTranslations("Onboarding.Complete.card");
  const [copied, setCopied] = useState(false);

  const domain = process.env.NEXT_PUBLIC_DIRECTORY_DOMAIN ?? "pacificdatacommons.io";
  const listingUrl = `https://${domain}/providers/${providerSlug}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(listingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the URL is
      // still visible and selectable on the page, so this is non-fatal.
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{t("body", { institutionName, datasetTitle: datasetTitle || t("untitled") })}</p>
        <p className="mt-2 font-medium text-navy">{t("underReview")}</p>

        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">{t("listingUrlLabel")}</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 truncate text-sm text-navy">{listingUrl}</code>
            <Button type="button" variant="secondary" onClick={handleCopy}>
              {copied ? t("copied") : t("copy")}
            </Button>
          </div>
        </div>

        {datasetTitle && (
          <div className="mt-4">
            <p className="text-xs text-gray-500 mb-2">Share your new dataset listing</p>
            <ShareButtons
              datasetName={datasetTitle}
              providerName={institutionName}
              datasetUrl={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/data/${providerSlug}/${slugify(datasetTitle)}`}
              pricePerQuery="from $0.01"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
