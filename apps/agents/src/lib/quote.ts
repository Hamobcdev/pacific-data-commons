import { randomUUID } from "node:crypto";
import type { AgentInput } from "@pdc/shared-types";
import type { RunnableAgent } from "../agents/base.js";
import type { AgentRegistryEntry } from "../agents/registry.js";
import { quoteStore, type AgentQuote } from "./quoteStore.js";

export const QUOTE_VALIDITY_MS = 5 * 60 * 1000;

/**
 * Session 13 — the missing half of Model F (see base.ts's own doc comment:
 * "That collection mechanism ... is out of scope here"). Reuses the agent's
 * existing dry_run path rather than re-implementing endpoint resolution: the
 * dry-run preview (preview.endpoints_to_query, preview.estimated_cost_usdc)
 * already IS the quote's cost basis, computed by the exact same
 * resolveEndpoints() the live run will use — this just adds the agent's
 * markup, an id, and an expiry on top, so a quote can never describe a
 * different endpoint set than the one the live run actually queries.
 *
 * Throws whatever agent.run() throws (InsufficientDataError,
 * SovereigntyBlockedError, or a generic validation Error) — callers use the
 * same catch pattern app.ts's existing POST /agents/:type route already
 * uses, not a second error-mapping scheme.
 */
export async function calculateAgentQuote(
  agent: RunnableAgent,
  entry: AgentRegistryEntry,
  parameters: Record<string, string>,
  userWallet: string,
): Promise<AgentQuote> {
  const input: AgentInput = {
    agent_type: entry.agentType,
    parameters,
    user_wallet: userWallet,
    output_language: "en",
    dry_run: true,
  };

  const output = await agent.run(input);
  // agent.run() with dry_run:true always populates `preview` (see base.ts's
  // run() — the only early return before that point is dry_run's own
  // preview construction). Absence here would mean base.ts's contract
  // changed underneath this file.
  if (!output.preview) {
    throw new Error(`Agent "${entry.slug}" dry run did not return a preview — cannot quote.`);
  }

  const subtotalUsdc = output.preview.estimated_cost_usdc;
  const markupPct = entry.markupPct;
  const markupUsdc = round2(subtotalUsdc * (markupPct / 100));
  const totalUsdc = round2(subtotalUsdc + markupUsdc);

  const quote: AgentQuote = {
    quote_id: randomUUID(),
    agent_slug: entry.slug,
    agent_type: entry.agentType,
    parameters,
    user_wallet: userWallet,
    endpoint_costs: output.preview.endpoints_to_query.map((e) => ({
      endpoint_id: e.endpoint_id,
      name: e.title,
      price_usdc: e.price_usdc,
    })),
    subtotal_usdc: subtotalUsdc,
    markup_pct: markupPct,
    markup_usdc: markupUsdc,
    total_usdc: totalUsdc,
    pay_to_address: agent.walletAddress,
    quote_expires_at: new Date(Date.now() + QUOTE_VALIDITY_MS).toISOString(),
    used: false,
  };

  quoteStore.save(quote);
  return quote;
}

/** Decimal USDC has no more than 2 meaningful places for display/payment
 * purposes — avoids e.g. 0.1 * 0.2 floating-point noise showing up in a
 * quote a user is asked to read and pay exactly. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
