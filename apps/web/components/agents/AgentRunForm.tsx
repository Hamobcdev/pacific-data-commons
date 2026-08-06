"use client";

import { useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { dryRunAgent } from "@/actions/agents/dry-run-agent";
import { loadAgentRunForm, saveAgentRunForm } from "@/lib/agents/formState";
import { loadAgentReport } from "@/lib/agents/reportState";
import { DryRunPreview } from "./DryRunPreview";
import { AgentResult } from "./AgentResult";
import { WalletBalance } from "./WalletBalance";
import type { AgentCatalogueEntry } from "@/lib/agents/types";
import type { AgentOutput } from "@pdc/shared-types";
import type { AgentRunErrorCode } from "@/lib/agents/runner";

// Session 13 — everything past the free dry-run preview needs a real
// browser wallet connection (algosdk + Pera/Lute connect SDKs), which adds
// roughly 200kB to this route's First Load JS. P8 (Pacific connectivity)
// says that cost has no business landing on a visitor who is still reading
// the agent description or filling in inputs — `ssr: false` and a dynamic
// import mean that bundle only downloads once someone has actually
// confirmed a free preview and is about to see a real quote.
const PaymentFlow = dynamic(() => import("./PaymentFlow").then((m) => m.PaymentFlow), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-10">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-ocean border-t-transparent" aria-hidden="true" />
    </div>
  ),
});

type Step = "configure" | "preview" | "payment";

const ERROR_KEY_BY_CODE: Record<AgentRunErrorCode, string> = {
  insufficient_data: "error_no_data",
  sovereignty_blocked: "error_sovereignty",
  invalid_request: "error_no_data",
  rate_limited: "error_unavailable",
  unavailable: "error_unavailable",
};

/**
 * Configure -> Dry Run Preview -> (Quote -> Pay -> Result, in PaymentFlow).
 * Confirming the dry-run preview used to call runAgentLive() directly —
 * free execution, since nothing collected a user payment (see
 * apps/agents/src/agents/base.ts's own doc comment flagging that gap).
 * Session 13 splits everything past the preview into a lazily-loaded
 * PaymentFlow, which fetches a real quote (subtotal + agent markup) and
 * requires a confirmed on-chain USDC payment before execute() is called.
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
  const [savedReport, setSavedReport] = useState<AgentOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A restored report needs none of PaymentFlow's wallet bundle — handled
    // entirely here so re-visiting a finished report stays on the light path.
    const report = loadAgentReport(agent.id);
    if (report) {
      setSavedReport(report);
      return;
    }
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

  const handleRunAgain = () => {
    setSavedReport(null);
    setPreview(null);
    setError(null);
    setStep("configure");
  };

  if (savedReport) {
    return <AgentResult output={savedReport} onRunAgain={handleRunAgain} />;
  }

  if (step === "payment") {
    return <PaymentFlow agent={agent} parameters={parameters} userWallet={userWallet} onBack={() => setStep("preview")} onRunAgain={handleRunAgain} />;
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
        <DryRunPreview preview={preview} onConfirm={() => setStep("payment")} onCancel={() => setStep("configure")} isSubmitting={isPending} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{agent.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {agent.fields.map((field) => (
              <label key={field.name} className="form-label block text-gray-700">
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

            <label className="form-label block text-gray-700">
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
