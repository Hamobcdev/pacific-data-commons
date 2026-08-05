"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createDeployment } from "@/actions/onboarding/create-deployment";
import { SESSION_EXPIRED_ERROR } from "@/lib/onboarding/session-constants";
import { flagSessionExpired } from "@/lib/onboarding/flag-session-expired";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface SbpManagedPathProps {
  providerId: string;
  sessionToken: string;
  deploymentId: string | null;
  onSubmitted: (deploymentId: string) => void;
}

/** Path A — SBP Managed. No Railway call happens here (manual SBP action
 * during POC); this just records the request and shows the pending state. */
export function SbpManagedPath({ providerId, sessionToken, deploymentId, onSubmitted }: SbpManagedPathProps) {
  const t = useTranslations("Onboarding.Deploy.sbpManaged");
  const tShell = useTranslations("Onboarding.shell");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createDeployment(providerId, sessionToken);
      if (result.success && result.deploymentId) {
        onSubmitted(result.deploymentId);
      } else if (result.error === SESSION_EXPIRED_ERROR) {
        flagSessionExpired(tShell("sessionExpired"));
        router.push("/onboarding");
      } else {
        setError(result.error ?? t("genericError"));
      }
    });
  };

  if (deploymentId) {
    return (
      <Card>
        <CardContent>
          <p className="font-medium text-navy">{t("confirmed.title")}</p>
          <p className="mt-1 text-sm text-gray-600">{t("confirmed.deploymentId", { id: deploymentId })}</p>
          <p className="mt-2 text-sm text-gray-600">{t("confirmed.timeline")}</p>
          <a href="/dashboard" className="mt-4 inline-block cursor-not-allowed text-sm text-gray-400" aria-disabled="true">
            {t("confirmed.dashboardLink")}
          </a>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <p className="text-sm text-gray-600">{t("description")}</p>
        {error && (
          <Alert variant="error" className="mt-3">
            {error}
          </Alert>
        )}
        <Button type="button" className="mt-4" onClick={handleSubmit} disabled={isPending}>
          {isPending ? t("submitting") : t("submit")}
        </Button>
      </CardContent>
    </Card>
  );
}
