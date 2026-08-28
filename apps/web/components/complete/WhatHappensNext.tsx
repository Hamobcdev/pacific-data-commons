"use client";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import type { DeployPath } from "@/lib/onboarding/state";

/**
 * Session 37A — the completed-onboarding page previously had no path-specific
 * forward guidance (the existing generic "Go to Dashboard" button above stays
 * untouched). This adds it, branched on the deploy path chosen in Step 6
 * when that state was available (see CompleteLayout's deployPath capture);
 * falls back to showing both paths' guidance when it wasn't.
 */
export function WhatHappensNext({ deployPath }: { deployPath: DeployPath | "" }) {
  const showSelfService = deployPath === "self_hosted" || deployPath === "";
  const showSbpAssisted = deployPath === "sbp_managed" || deployPath === "";

  return (
    <div className="rounded-lg border border-gray-200 p-5 space-y-5">
      <h2 className="text-base font-semibold text-navy">What happens next</h2>

      {showSelfService && (
        <div>
          <p className="text-sm text-gray-700 leading-relaxed">
            Implement your endpoint using the template, then return to your dashboard to paste your live URL. SBP
            will register your endpoint and issue your provenance certificate within 24 hours of you confirming it
            is live.
          </p>
          <div className="mt-3 flex flex-col sm:flex-row gap-3">
            <Link href="/dashboard">
              <Button type="button" className="w-full sm:w-auto min-h-[44px]">
                Go to Dashboard
              </Button>
            </Link>
            <a href="https://github.com/Hamobcdev/pdc-endpoint-template" target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="secondary" className="w-full sm:w-auto min-h-[44px]">
                Endpoint template on GitHub →
              </Button>
            </a>
          </div>
        </div>
      )}

      {showSbpAssisted && (
        <div>
          <p className="text-sm text-gray-700 leading-relaxed">
            Your registration is complete. SBP will contact you to begin deployment work. Check your email for a
            confirmation with your reference code.
          </p>
          <div className="mt-3">
            <Link href="/dashboard">
              <Button type="button" className="w-full sm:w-auto min-h-[44px]">
                Go to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
