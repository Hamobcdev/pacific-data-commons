"use server";

import type { AgentInput } from "@pdc/shared-types";
import { runAgent, type AgentRunResult } from "@/lib/agents/runner";
import { AGENT_TYPE_BY_SLUG, findCatalogueEntry } from "@/lib/agents/types";

/**
 * Step 2 of the run flow (Configure -> Dry Run Preview -> Confirm -> Result)
 * — never makes a payment (R8).
 */
export async function dryRunAgent(slug: string, parameters: Record<string, string>, userWallet: string): Promise<AgentRunResult> {
  const entry = findCatalogueEntry(slug);
  if (!entry) {
    return { success: false, code: "invalid_request", message: `Unknown agent "${slug}".` };
  }

  const input: AgentInput = {
    agent_type: AGENT_TYPE_BY_SLUG[entry.id],
    parameters,
    user_wallet: userWallet,
    output_language: "en",
    dry_run: true,
  };

  return runAgent(entry.id, input);
}
