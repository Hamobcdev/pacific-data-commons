"use server";

import type { AgentOutput } from "@pdc/shared-types";
import { agentsServiceUrl } from "@/lib/agents/runner";
import { findCatalogueEntry } from "@/lib/agents/types";

export type ExecuteAgentErrorCode =
  | "invalid_request"
  | "quote_not_found"
  | "quote_agent_mismatch"
  | "quote_already_used"
  | "quote_expired"
  | "rate_limited"
  | "payment_not_verified"
  | "insufficient_data"
  | "sovereignty_blocked"
  | "unavailable";

export type ExecuteAgentResult = { success: true; output: AgentOutput } | { success: false; code: ExecuteAgentErrorCode; message: string };

const KNOWN_CODES: ExecuteAgentErrorCode[] = [
  "invalid_request",
  "quote_not_found",
  "quote_agent_mismatch",
  "quote_already_used",
  "quote_expired",
  "rate_limited",
  "payment_not_verified",
  "insufficient_data",
  "sovereignty_blocked",
];

/**
 * Step 5 of the run flow (Session 13) — called only after the user's wallet
 * has signed and the resulting transaction is confirmed on-chain (Decision
 * B: never execute on a pending transaction — see components handling the
 * calling side for the confirmation wait). The agents service independently
 * re-verifies that transaction before running anything; this action never
 * trusts the client's own claim that payment succeeded.
 */
export async function executeAgent(slug: string, quoteId: string, txId: string): Promise<ExecuteAgentResult> {
  const entry = findCatalogueEntry(slug);
  if (!entry) {
    return { success: false, code: "invalid_request", message: `Unknown agent "${slug}".` };
  }

  let url: string;
  try {
    url = `${agentsServiceUrl()}/agents/${entry.id}/execute`;
  } catch (err) {
    return { success: false, code: "unavailable", message: err instanceof Error ? err.message : String(err) };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quote_id: quoteId, tx_id: txId }),
      cache: "no-store",
    });
    const body: unknown = await res.json().catch(() => undefined);

    if (!res.ok) {
      const errorBody = body as { error?: string; message?: string } | undefined;
      const code = errorBody?.error;
      const matched = KNOWN_CODES.find((c) => c === code);
      if (matched) {
        return { success: false, code: matched, message: errorBody?.message ?? "Could not run the agent." };
      }
      return {
        success: false,
        code: "unavailable",
        message: errorBody?.message ?? "Agent service is temporarily unavailable. Your payment has been confirmed on-chain — contact SBP if a report doesn't arrive.",
      };
    }

    return { success: true, output: body as AgentOutput };
  } catch {
    return {
      success: false,
      code: "unavailable",
      message: "Agent service is temporarily unavailable. Your payment has been confirmed on-chain — contact SBP if a report doesn't arrive.",
    };
  }
}
