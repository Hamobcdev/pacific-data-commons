"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { dryRunAgent } from "@/actions/agents/dry-run-agent";
import { runAgentLive } from "@/actions/agents/run-agent";
import { loadAgentRunForm, saveAgentRunForm } from "@/lib/agents/formState";
import { DryRunPreview } from "./DryRunPreview";
import { AgentResult } from "./AgentResult";
import { WalletBalance } from "./WalletBalance";
import type { AgentCatalogueEntry } from "@/lib/agents/types";
import type { AgentOutput } from "@pdc/shared-types";
import type { AgentRunErrorCode } from "@/lib/agents/runner";

type Step = "configure" | "preview" | "result";

const ERROR_KEY_BY_CODE: Record<AgentRunErrorCode, string> = {
  insufficient_data: "error_no_data",
  sovereignty_blocked: "error_sovereignty",
  invalid_request: "error_no_data",
  rate_limited: "error_unavailable",
  unavailable: "error_unavailable",
};

/**
 * The full Configure -> Dry Run Preview -> Confirm -> Result flow
 * (Deliverable 7). One component owns all four states rather than four
 * separate pages/routes — this keeps the in-progress parameters and wallet
 * in one place across the flow instead of round-tripping them through URL
 * state, and matches the localStorage-backed single-flow pattern
 * components/wallet/WalletForm.tsx already uses for onboarding (P8).
 */
export function AgentRunForm({
  agent,
  presetWallet,
  walletBalance,
}: {
  agent: AgentCatalogueEntry;
  presetWallet?: string;
  walletBalance?: { totalRevenueUsdc: number; agentSpendUsdc: number };
}) {
  const t = useTranslations("AgentMarketplace");
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("configure");
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [userWallet, setUserWallet] = useState(presetWallet ?? "");
  const [preview, setPreview] = useState<AgentOutput["preview"] | null>(null);
  const [result, setResult] = useState<AgentOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadAgentRunForm(agent.id);
    if (saved) {
      setParameters(saved.parameters);
      if (!presetWallet && saved.userWallet) setUserWallet(saved.userWallet);
    }
    // agent.id-only dependency is deliberate: this restores saved state
    // once when the form for this agent mounts, not on every parameter edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id]);

  const persist = (nextParameters: Record<string, string>, nextWallet: string) => {
    setParameters(nextParameters);
    setUserWallet(nextWallet);
    saveAgentRunForm(agent.id, { parameters: nextParameters, userWallet: nextWallet });
  };

  const requiredFieldsFilled = agent.fields.filter((f) => f.required).every((f) => (parameters[f.name] ?? "").trim().length > 0);
  const canPreview = requiredFieldsFilled && userWallet.trim().length > 0;

  const handlePreview = () => {
    setError(null);
    startTransition(async () => {
      const res = await dryRunAgent(agent.id, parameters, userWallet);
      if (!res.success) {
        setError(t(ERROR_KEY_BY_CODE[res.code]));
        return;
      }
      setPreview(res.output.preview ?? null);
      setStep("preview");
    });
  };

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const res = await runAgentLive(agent.id, parameters, userWallet);
      if (!res.success) {
        setError(t(ERROR_KEY_BY_CODE[res.code]));
        setStep("configure");
        return;
      }
      setResult(res.output);
      setStep("result");
    });
  };

  const handleRunAgain = () => {
    setResult(null);
    setPreview(null);
    setError(null);
    setStep("configure");
  };

  if (step === "result" && result) {
    return <AgentResult output={result} onRunAgain={handleRunAgain} />;
  }

  return (
    <div className="space-y-4">
      {walletBalance && presetWallet && (
        <WalletBalance
          walletAddress={presetWallet}
          totalRevenueUsdc={walletBalance.totalRevenueUsdc}
          agentSpendUsdc={walletBalance.agentSpendUsdc}
        />
      )}

      {step === "preview" && preview ? (
        <DryRunPreview preview={preview} onConfirm={handleConfirm} onCancel={() => setStep("configure")} isSubmitting={isPending} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{agent.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {agent.fields.map((field) => (
              <label key={field.name} className="block text-sm font-medium text-gray-700">
                {field.label}
                {field.kind === "select" ? (
                  <Select
                    options={field.options ?? []}
                    placeholder={field.required ? "Select…" : "Select (optional)…"}
                    value={parameters[field.name] ?? ""}
                    onChange={(e) => persist({ ...parameters, [field.name]: e.target.value }, userWallet)}
                  />
                ) : (
                  <Input
                    value={parameters[field.name] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(e) => persist({ ...parameters, [field.name]: e.target.value }, userWallet)}
                  />
                )}
              </label>
            ))}

            <label className="block text-sm font-medium text-gray-700">
              Your Algorand wallet
              <Input
                value={userWallet}
                placeholder="Your Algorand address"
                disabled={Boolean(presetWallet)}
                onChange={(e) => persist(parameters, e.target.value)}
              />
            </label>

            {error && <Alert variant="error">{error}</Alert>}

            <Button variant="primary" disabled={!canPreview || isPending} onClick={handlePreview}>
              {isPending ? t("running") : t("run_agent")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
