"use server";

import type { AgentInput } from "@pdc/shared-types";
import { runAgent, type AgentRunResult } from "@/lib/agents/runner";
import { AGENT_TYPE_BY_SLUG, findCatalogueEntry } from "@/lib/agents/types";

/**
 * Step 3 of the run flow — Confirm and Run. Called only after the user has
 * seen the dry-run preview and explicitly confirmed (the UI never calls
 * this directly from Configure). Real payment is made by the agent's
 * operational wallet inside apps/agents (R2/Model F) — this action never
 * touches a wallet or a payment itself, it only forwards the request.
 */
export async function runAgentLive(slug: string, parameters: Record<string, string>, userWallet: string): Promise<AgentRunResult> {
  const entry = findCatalogueEntry(slug);
  if (!entry) {
    return { success: false, code: "invalid_request", message: `Unknown agent "${slug}".` };
  }

  const input: AgentInput = {
    agent_type: AGENT_TYPE_BY_SLUG[entry.id],
    parameters,
    user_wallet: userWallet,
    output_language: "en",
    dry_run: false,
  };

  return runAgent(entry.id, input);
}
