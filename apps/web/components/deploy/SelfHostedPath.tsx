"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { generateEndpointPackage } from "@/actions/onboarding/generate-endpoint-package";
import { SESSION_EXPIRED_ERROR } from "@/lib/onboarding/session-constants";
import { flagSessionExpired } from "@/lib/onboarding/flag-session-expired";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface SelfHostedPathProps {
  providerId: string;
  sessionToken: string;
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: contentType });
}

/** Path B — Self-hosted. Server actions can't set a
 * Content-Disposition download header (that's a Route Handler concept) —
 * this decodes the base64 ZIP the server action returns into a Blob and
 * triggers the browser download client-side instead. */
export function SelfHostedPath({ providerId, sessionToken }: SelfHostedPathProps) {
  const t = useTranslations("Onboarding.Deploy.selfHosted");
  const tShell = useTranslations("Onboarding.shell");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateEndpointPackage(providerId, sessionToken);
      if (result.success && result.base64Zip && result.filename) {
        const blob = base64ToBlob(result.base64Zip, "application/zip");
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setDownloaded(true);
      } else if (result.error === SESSION_EXPIRED_ERROR) {
        flagSessionExpired(tShell("sessionExpired"));
        router.push("/onboarding");
      } else {
        setError(result.error ?? t("genericError"));
      }
    });
  };

  return (
    <Card>
      <CardContent>
        <p className="text-sm text-gray-600">{t("description")}</p>
        {error && (
          <Alert variant="error" className="mt-3">
            {error}
          </Alert>
        )}
        {downloaded && (
          <Alert variant="success" className="mt-3">
            {t("downloaded")}
          </Alert>
        )}
        <Button type="button" variant="secondary" className="mt-4" onClick={handleDownload} disabled={isPending}>
          {isPending ? t("generating") : t("download")}
        </Button>
      </CardContent>
    </Card>
  );
}
