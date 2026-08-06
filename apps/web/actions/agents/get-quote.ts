"use server";

import type { AgentQuote } from "@pdc/shared-types";
import { agentsServiceUrl } from "@/lib/agents/runner";
import { findCatalogueEntry } from "@/lib/agents/types";

export type GetQuoteResult =
  | { success: true; quote: AgentQuote }
  | { success: false; code: "invalid_request" | "insufficient_data" | "sovereignty_blocked" | "rate_limited" | "unavailable"; message: string };

/**
 * Step 3 of the run flow (Session 13) — Configure -> Dry Run Preview ->
 * Quote -> Pay -> Result. Called after the user confirms the free dry-run
 * preview; unlike that preview, a quote has a real cost basis (the agent's
 * markup applied on top) and a 5-minute redemption window, because it's
 * what the user is about to pay against.
 */
export async function getAgentQuote(slug: string, parameters: Record<string, string>, userWallet: string): Promise<GetQuoteResult> {
  const entry = findCatalogueEntry(slug);
  if (!entry) {
    return { success: false, code: "invalid_request", message: `Unknown agent "${slug}".` };
  }

  let url: string;
  try {
    url = `${agentsServiceUrl()}/agents/${entry.id}/quote`;
  } catch (err) {
    return { success: false, code: "unavailable", message: err instanceof Error ? err.message : String(err) };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parameters, user_wallet: userWallet }),
      cache: "no-store",
    });
    const body: unknown = await res.json().catch(() => undefined);

    if (!res.ok) {
      const errorBody = body as { error?: string; message?: string } | undefined;
      const code = errorBody?.error;
      if (code === "insufficient_data" || code === "sovereignty_blocked" || code === "rate_limited" || code === "invalid_request") {
        return { success: false, code, message: errorBody?.message ?? "Could not generate a quote." };
      }
      return { success: false, code: "unavailable", message: errorBody?.message ?? "Agent service is temporarily unavailable. You were not charged." };
    }

    return { success: true, quote: body as AgentQuote };
  } catch {
    return { success: false, code: "unavailable", message: "Agent service is temporarily unavailable. You were not charged. Please try again." };
  }
}
