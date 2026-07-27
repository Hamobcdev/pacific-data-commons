"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { loadLocalState, saveLocalState, defaultState, type DeployPath } from "@/lib/onboarding/state";
import { StepNav } from "@/components/onboarding/StepNav";
import { DeployPathSelector } from "./DeployPathSelector";
import { SbpManagedPath } from "./SbpManagedPath";
import { SelfHostedPath } from "./SelfHostedPath";

/** Orchestrates Step 6 — not itself in the Session 6 file list, but
 * necessary glue: page.tsx is a Server Component (getTranslations), and
 * DeployPathSelector/SbpManagedPath/SelfHostedPath need shared client state
 * (chosen path, deploymentId), same role ReviewLayout/ProvenanceForm play
 * for Steps 4-5. */
export function DeployLayout() {
  const t = useTranslations("Onboarding.Deploy");
  const router = useRouter();
  const [providerId, setProviderId] = useState<string | null>(null);
  const [path, setPath] = useState<DeployPath | "">("");
  const [deploymentId, setDeploymentId] = useState<string | null>(null);

  useEffect(() => {
    const state = loadLocalState();
    if (!state?.providerId) {
      router.replace("/onboarding/register");
      return;
    }
    setProviderId(state.providerId);
    setPath(state.deploy.path);
    setDeploymentId(state.deploy.deploymentId);
  }, [router]);

  const choosePath = (chosen: DeployPath) => {
    setPath(chosen);
    const state = loadLocalState() ?? defaultState();
    saveLocalState({ ...state, deploy: { ...state.deploy, path: chosen } });
  };

  const handleDeploymentSubmitted = (id: string) => {
    setDeploymentId(id);
    const state = loadLocalState() ?? defaultState();
    saveLocalState({ ...state, deploy: { ...state.deploy, deploymentId: id } });
  };

  const handleContinue = () => {
    const state = loadLocalState() ?? defaultState();
    saveLocalState({ ...state, currentStep: "complete" });
    router.push("/onboarding/complete");
  };

  if (!providerId) return null;

  const canContinue = path === "self_hosted" || (path === "sbp_managed" && Boolean(deploymentId));

  return (
    <div className="mt-6 space-y-6">
      <DeployPathSelector value={path} onChange={choosePath} />

      {path === "sbp_managed" && <SbpManagedPath providerId={providerId} deploymentId={deploymentId} onSubmitted={handleDeploymentSubmitted} />}
      {path === "self_hosted" && <SelfHostedPath providerId={providerId} />}

      <StepNav
        onBack={() => router.push("/onboarding/provenance")}
        onNext={handleContinue}
        nextDisabled={!canContinue}
        nextLabel={t("continue")}
      />
    </div>
  );
}
