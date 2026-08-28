import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentType } from "@pdc/shared-types";
import { AppError, ValidationError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { ALGORAND_ADDRESS_RE } from "../lib/algorandAttestation.js";

const AGENT_TYPES: AgentType[] = [
  "trade_intelligence",
  "climate_risk",
  "fisheries_status",
  "agricultural_exports",
  "remittance_navigator",
  "grant_matcher",
  "third_party",
];

const selfRegisterSchema = z.object({
  agent_name: z.string().min(1).max(200),
  agent_type: z.enum(AGENT_TYPES as [AgentType, ...AgentType[]]),
  operational_wallet: z.string().regex(ALGORAND_ADDRESS_RE, "must be a valid Algorand address"),
  description: z.string().max(2000).optional(),
});

export interface SelfRegisterResult {
  agent_id: string;
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(body)"}: ${issue.message}`).join("; ");
}

/**
 * POST /internal/agents/self-register (Session 19). Lets a first-party
 * SBP-operated agent (currently: apps/sbp-agent, plus the two orchestrators
 * in this same service — pacificIntelligenceService.ts,
 * pacificTourismService.ts) provision its own `agents` row at boot/per-run
 * rather than requiring a human to hand-insert one — the row is a
 * prerequisite for submitting Decision 37 attribution records.
 *
 * Hotfix (post-Session 34): the lookup used to be by operational_wallet,
 * which broke as soon as more than one caller shared a wallet — confirmed
 * live, the `agents` table has 6 rows (the Phase 2 first-party marketplace
 * agent placeholders) that all share one identical dummy operational_wallet
 * (see supabase/migrations/session19_transaction_logging.sql's note), and
 * both orchestrators reuse that same wallet too (apps/sbp-agent's real
 * AGENT_WALLET_ADDRESS, per env.ts's AGENT_WALLET_KEY comment). A
 * .maybeSingle() lookup against a column 6+ rows share throws PostgREST's
 * "multiple rows returned" error on every call — the
 * orchestrator_self_register_failed / tourism_orchestrator_self_register_failed
 * warnings in the Railway logs.
 *
 * Looking up by agent_name instead — NOT agent_type — because agent_type is
 * not actually unique per caller: both orchestrators pass
 * agent_type: "fisheries_status" (there's no "orchestrator" value in
 * AgentType, so each reuses the closest existing category — see their own
 * call sites' comments), which collides with each other AND with the
 * seeded "Pacific Fisheries Status" marketplace agent's row. agent_name is
 * the one field distinct across every real caller ("SBP Pilot Agent",
 * "Pacific Intelligence Orchestrator", "Pacific Tourism Orchestrator", and
 * the 6 seeded marketplace agent names) — confirmed live, zero collisions.
 *
 * Still a plain select-then-insert, not an upsert against a DB constraint:
 * this route is only ever called by a small number of SBP-operated
 * singleton agents at their own boot/per-run time, not a high-concurrency
 * public registration path.
 */
export async function selfRegisterAgent(supabase: SupabaseClient, rawBody: unknown): Promise<SelfRegisterResult> {
  const parsed = selfRegisterSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new ValidationError(`Invalid self-register payload — ${formatZodIssues(parsed.error)}`);
  }
  const req = parsed.data;

  const { data: existing, error: lookupError } = await supabase
    .from("agents")
    .select("id")
    .eq("agent_name", req.agent_name)
    .maybeSingle();

  if (lookupError) {
    throw new AppError(502, "database_error", `Agent lookup failed: ${lookupError.message}`);
  }
  if (existing) {
    return { agent_id: existing.id as string };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("agents")
    .insert({
      agent_name: req.agent_name,
      agent_type: req.agent_type,
      developer_id: null,
      operational_wallet: req.operational_wallet,
      is_active: true,
      description: req.description ?? null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    logger.error("agent_self_register_failed", {
      agentName: req.agent_name,
      error: insertError?.message,
    });
    throw new AppError(502, "database_error", `Agent registration failed: ${insertError?.message ?? "unknown error"}`);
  }

  logger.info("agent_self_registered", { agentId: inserted.id, agentName: req.agent_name });
  return { agent_id: inserted.id as string };
}
