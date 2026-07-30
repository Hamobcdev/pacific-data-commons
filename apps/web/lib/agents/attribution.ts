import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { AttributionStatus } from "@pdc/shared-types";

/**
 * Attribution record submission itself (Decision 37 — the wallet-signed
 * POST /agent/attribution call) happens inside apps/agents' BaseAgent.run()
 * (apps/agents/src/lib/attribution.ts), signed with the agent's operational
 * wallet key. That key never reaches apps/web, so this file cannot submit
 * records — only read the status of ones already submitted, for
 * get-agent-runs.ts's run-history display. Uses the service-role client
 * (agent_run_endpoints has no anon/authenticated read RLS policy by design
 * — session6_1_agent_schema.sql's own comment: privacy protection for
 * originating_user_wallet_hash).
 */
export interface AttributionStatusRow {
  run_id: string;
  agent_id: string;
  attribution_status: AttributionStatus;
  submitted_at: string;
  reconciled_at: string | null;
}

/** Must match apps/agents/src/lib/attribution.ts's hashUserWallet exactly —
 * this is how a run submitted for `wallet` is found again without the
 * server ever storing the raw wallet address. */
export function hashUserWallet(address: string): string {
  return createHash("sha256").update(address).digest("hex");
}

export async function getRunsForWallet(userWallet: string, limit = 10): Promise<AttributionStatusRow[]> {
  const supabase = createServiceClient();
  const walletHash = hashUserWallet(userWallet);

  const { data, error } = await supabase
    .from("agent_run_endpoints")
    .select("run_id, agent_id, attribution_status, submitted_at, reconciled_at")
    .eq("originating_user_wallet_hash", walletHash)
    .order("submitted_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as AttributionStatusRow[];
}
