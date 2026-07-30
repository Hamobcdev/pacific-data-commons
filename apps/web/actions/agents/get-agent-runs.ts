"use server";

import { getRunsForWallet, type AttributionStatusRow } from "@/lib/agents/attribution";

/** Run history for the result page's "past runs" context and any future
 * dashboard view — reads attribution records already submitted by
 * apps/agents, keyed by the same wallet-hash apps/agents' attribution
 * client computes (see lib/agents/attribution.ts). */
export async function getAgentRuns(userWallet: string): Promise<AttributionStatusRow[]> {
  if (!userWallet) return [];
  return getRunsForWallet(userWallet);
}
