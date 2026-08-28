"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { loadLocalState } from "@/lib/onboarding/state";
import { Button } from "@/components/ui/button";
import { SelfServiceCard } from "./SelfServiceCard";
import { AssistedCard } from "./AssistedCard";
import { ComplexCard } from "./ComplexCard";

/**
 * Orchestrates Step 6 (Session 37B — replaces the Session 6 two-path
 * DeployPathSelector/SbpManagedPath/SelfHostedPath structure with three
 * cards, each owning its own submit action and its own advance to
 * /onboarding/complete). page.tsx is a Server Component (getTranslations),
 * so session/providerId loading stays client-side here, same role
 * ReviewLayout/ProvenanceForm play for earlier steps.
 */
export function DeployLayout() {
  const router = useRouter();
  const [providerId, setProviderId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [status, setStatus] = useState<"checking" | "redirecting" | "ready">("checking");

  useEffect(() => {
    const state = loadLocalState();
    if (!state?.providerId || !state.sessionToken) {
      setStatus("redirecting");
      router.replace("/onboarding/register");
      return;
    }
    setProviderId(state.providerId);
    setSessionToken(state.sessionToken);
    setContactEmail(state.registration.contactEmail);
    setInstitutionName(state.registration.institutionName);
    setStatus("ready");
  }, [router]);

  if (status === "checking") {
    return <p className="mt-6 text-sm text-gray-500">Loading your registration...</p>;
  }

  if (status === "redirecting" || !providerId || !sessionToken) {
    return <p className="mt-6 text-sm text-gray-500">We couldn't find your registration session — taking you back to Step 1.</p>;
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SelfServiceCard providerId={providerId} sessionToken={sessionToken} />
        <AssistedCard providerId={providerId} sessionToken={sessionToken} providerContactEmail={contactEmail} />
        <ComplexCard institutionName={institutionName} />
      </div>

      <div className="pt-2">
        <Button type="button" variant="ghost" onClick={() => router.push("/onboarding/provenance")}>
          Back
        </Button>
      </div>
    </div>
  );
}
