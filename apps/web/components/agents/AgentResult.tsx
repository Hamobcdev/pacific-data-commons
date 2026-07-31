"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { AgentOutput } from "@pdc/shared-types";

const TRUST_TIER_VARIANT = { bronze: "neutral", silver: "success", gold: "warning" } as const;

export function AgentResult({ output, onRunAgain }: { output: AgentOutput; onRunAgain: () => void }) {
  const t = useTranslations("AgentMarketplace");

  let prettySynthesis = output.synthesis ?? "";
  if (output.structured_data) {
    try {
      prettySynthesis = JSON.stringify(output.structured_data, null, 2);
    } catch {
      // structured_data isn't JSON-serialisable (shouldn't happen — it came
      // from JSON.parse) — fall back to the raw synthesis text.
    }
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("result_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {output.data_warning && <Alert variant="warning">{output.data_warning}</Alert>}

          {prettySynthesis ? (
            <pre className="whitespace-pre-wrap rounded-md bg-light-bg p-4 text-sm text-navy">{prettySynthesis}</pre>
          ) : (
            <p className="text-sm text-gray-500">No synthesis output was returned for this run.</p>
          )}

          <div>
            <h4 className="text-sm font-semibold text-navy">{t("citations_title")}</h4>
            <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200">
              {output.citations.map((citation) => (
                <li key={citation.endpoint_id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div>
                    <p className="font-medium text-navy">{citation.endpoint_title}</p>
                    <p className="text-gray-500">{citation.provider_institution}</p>
                    <p className="mt-0.5 font-mono text-xs text-gray-400">tx: {citation.algo_tx_id || "pending"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={TRUST_TIER_VARIANT[citation.trust_tier]}>{citation.trust_tier}</Badge>
                    <span className="text-xs text-gray-500">${citation.amount_usdc.toFixed(2)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-sm font-medium text-navy">
            <span>Total paid</span>
            <span>${output.total_cost_usdc.toFixed(2)} USDC</span>
          </div>

          <div className="flex gap-3 pt-2 print:hidden">
            <Button variant="secondary" onClick={() => window.print()}>
              {t("download_report")}
            </Button>
            <Button variant="ghost" onClick={onRunAgain}>
              {t("run_again")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
