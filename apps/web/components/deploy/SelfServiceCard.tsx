"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { generateEndpointPackage } from "@/actions/onboarding/generate-endpoint-package";
import { requestSelfServiceDeployment } from "@/actions/onboarding/deploy-request";
import { saveLocalState, loadLocalState, defaultState } from "@/lib/onboarding/state";
import { SESSION_EXPIRED_ERROR } from "@/lib/onboarding/session-constants";
import { flagSessionExpired } from "@/lib/onboarding/flag-session-expired";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function base64ToBlob(base64: string, contentType: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: contentType });
}

export interface SelfServiceCardProps {
  providerId: string;
  sessionToken: string;
}

/** Card 1 — self-service (Session 37B). Keeps the pre-Session-37B
 * SelfHostedPath.tsx feature (a downloadable ZIP pre-filled with this
 * provider's approved listing details) alongside the new generic GitHub
 * template link — the personalised package is real, working functionality
 * that Session 37B's brief didn't mention removing. */
export function SelfServiceCard({ providerId, sessionToken }: SelfServiceCardProps) {
  const tShell = useTranslations("Onboarding.shell");
  const router = useRouter();
  const [isDownloading, startDownload] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = () => {
    setDownloadError(null);
    startDownload(async () => {
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
        setDownloadError(result.error ?? "Could not generate your endpoint package. Please try again.");
      }
    });
  };

  const handleImplementMyself = () => {
    setSubmitError(null);
    startSubmit(async () => {
      const result = await requestSelfServiceDeployment(providerId, sessionToken);
      if (!result.success) {
        if (result.error === SESSION_EXPIRED_ERROR) {
          flagSessionExpired(tShell("sessionExpired"));
          router.push("/onboarding");
          return;
        }
        setSubmitError(result.error ?? "Could not record your deployment request. Please try again.");
        return;
      }

      const state = loadLocalState() ?? defaultState();
      saveLocalState({ ...state, currentStep: "complete", deploy: { ...state.deploy, path: "self_hosted" } });
      router.push("/onboarding/complete");
    });
  };

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-navy">Implement it yourself</h3>
        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Free</span>
      </div>

      <p className="mt-3 text-sm text-gray-700 leading-relaxed flex-1">
        Clone the endpoint template, add your data, deploy to your own infrastructure. SBP registers your endpoint in
        the directory and issues your provenance certificate once you confirm it is live.
      </p>

      <a
        href="https://github.com/Hamobcdev/pdc-endpoint-template"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 text-sm text-ocean hover:underline"
      >
        Endpoint template →
      </a>

      <div className="mt-3 rounded-md bg-light-bg p-3">
        <p className="text-xs text-gray-600">
          Prefer a head start? Download a package pre-filled with your approved listing details.
        </p>
        {downloadError && (
          <Alert variant="error" className="mt-2">
            {downloadError}
          </Alert>
        )}
        {downloaded && (
          <Alert variant="success" className="mt-2">
            Your package has downloaded. See the included README.md for deployment instructions.
          </Alert>
        )}
        <Button type="button" variant="secondary" className="mt-2 min-h-[44px]" onClick={handleDownload} disabled={isDownloading}>
          {isDownloading ? "Generating package..." : "Download endpoint package"}
        </Button>
      </div>

      {submitError && (
        <Alert variant="error" className="mt-3">
          {submitError}
        </Alert>
      )}

      <Button type="button" className="mt-4 min-h-[44px]" onClick={handleImplementMyself} disabled={isSubmitting}>
        {isSubmitting ? "Recording..." : "I'll implement this myself"}
      </Button>
    </div>
  );
}
