import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Agent, AttributionStatus } from "@pdc/shared-types";
import { AppError, ValidationError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import {
  ALGORAND_ADDRESS_RE,
  buildAttributionSignedMessage,
  verifyAlgorandSignature,
} from "../lib/algorandAttestation.js";

const ALGO_TX_ID_RE = /^[A-Z2-7]{52}$/;
const WALLET_HASH_RE = /^[0-9a-f]{64}$/i;

// 10 minutes — defense in depth alongside the (wallet, nonce) replay check
// below: bounds how long a captured-but-unsubmitted signed attestation stays
// valid, without requiring clock sync tighter than agents can realistically hold.
const MAX_TIMESTAMP_SKEW_MS = 10 * 60 * 1000;

const attributionRequestSchema = z.object({
  run_id: z.string().uuid("run_id must be a UUID"),
  agent_id: z.string().uuid("agent_id must be a UUID"),
  endpoint_tx_ids: z
    .array(z.string().regex(ALGO_TX_ID_RE, "must be a valid Algorand transaction id"))
    .min(1, "endpoint_tx_ids must include at least one transaction id"),
  originating_user_wallet_hash: z
    .string()
    .regex(WALLET_HASH_RE, "must be a 64-character hex SHA-256 digest"),
  signed_by: z.string().regex(ALGORAND_ADDRESS_RE, "must be a valid Algorand address"),
  signature: z.string().min(1, "signature is required"),
  nonce: z.string().min(8, "nonce must be at least 8 characters").max(128),
  // Required so the signed message (which embeds it) can be reconstructed
  // server-side — see AttributionRequest's doc comment in @pdc/shared-types.
  timestamp: z.string().datetime({ message: "must be an ISO-8601 datetime" }),
});

export interface AttributionResult {
  run_id: string;
  agent_id: string;
  attribution_status: AttributionStatus;
  submitted_at: string;
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(body)"}: ${issue.message}`).join("; ");
}

/**
 * POST /agent/attribution business logic (Decision 37). Order of checks is
 * deliberate: cheap structural validation first, then the agent/wallet
 * identity check (needed before signature verification can even be
 * attempted), then the two replay-prevention lookups, then the actual
 * cryptographic signature check last — no DB row is written until every
 * prior check has passed.
 */
export async function submitAttribution(supabase: SupabaseClient, rawBody: unknown): Promise<AttributionResult> {
  const parsed = attributionRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new ValidationError(`Invalid attribution payload — ${formatZodIssues(parsed.error)}`);
  }
  const req = parsed.data;

  const { data: agentRow, error: agentError } = await supabase
    .from("agents")
    .select("id, operational_wallet")
    .eq("id", req.agent_id)
    .maybeSingle();

  if (agentError) {
    throw new AppError(502, "database_error", `Agent lookup failed: ${agentError.message}`);
  }
  if (!agentRow) {
    throw new ValidationError(`"${req.agent_id}" is not a registered agent`);
  }

  const agent = agentRow as Pick<Agent, "id" | "operational_wallet">;
  if (agent.operational_wallet !== req.signed_by) {
    throw new AppError(
      422,
      "signature_invalid",
      "signed_by does not match this agent's registered operational_wallet",
    );
  }

  const timestampMs = Date.parse(req.timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_TIMESTAMP_SKEW_MS) {
    throw new AppError(422, "signature_invalid", "timestamp is outside the acceptable ±10 minute window");
  }

  const { data: existingNonce, error: nonceReadError } = await supabase
    .from("used_nonces")
    .select("wallet")
    .eq("wallet", req.signed_by)
    .eq("nonce", req.nonce)
    .maybeSingle();

  if (nonceReadError) {
    throw new AppError(502, "database_error", `Nonce check failed: ${nonceReadError.message}`);
  }
  if (existingNonce) {
    throw new AppError(409, "nonce_already_used", "This nonce has already been used by this wallet");
  }

  const { data: existingRun, error: runReadError } = await supabase
    .from("agent_run_endpoints")
    .select("id")
    .eq("agent_id", req.agent_id)
    .eq("run_id", req.run_id)
    .maybeSingle();

  if (runReadError) {
    throw new AppError(502, "database_error", `Duplicate run_id check failed: ${runReadError.message}`);
  }
  if (existingRun) {
    throw new AppError(409, "run_already_submitted", `run_id "${req.run_id}" has already been submitted for this agent`);
  }

  const signedMessage = buildAttributionSignedMessage({
    runId: req.run_id,
    agentId: req.agent_id,
    nonce: req.nonce,
    timestamp: req.timestamp,
  });
  if (!verifyAlgorandSignature(req.signed_by, signedMessage, req.signature)) {
    throw new AppError(422, "signature_invalid", "Signature verification failed");
  }

  // Nonce is recorded before the attribution record is inserted so a crash
  // between the two writes never leaves a nonce that can be replayed.
  const { error: nonceInsertError } = await supabase.from("used_nonces").insert({
    wallet: req.signed_by,
    nonce: req.nonce,
  });
  if (nonceInsertError) {
    // 23505 = Postgres unique_violation — a concurrent request won the race
    // against the read check above.
    if ((nonceInsertError as { code?: string }).code === "23505") {
      throw new AppError(409, "nonce_already_used", "This nonce has already been used by this wallet");
    }
    throw new AppError(502, "database_error", `Nonce recording failed: ${nonceInsertError.message}`);
  }

  const submittedAt = new Date().toISOString();
  const { error: insertError } = await supabase.from("agent_run_endpoints").insert({
    run_id: req.run_id,
    agent_id: req.agent_id,
    endpoint_tx_ids: req.endpoint_tx_ids,
    originating_user_wallet_hash: req.originating_user_wallet_hash,
    signed_by: req.signed_by,
    signature: req.signature,
    attribution_status: "pending",
  });

  if (insertError) {
    if ((insertError as { code?: string }).code === "23505") {
      throw new AppError(409, "run_already_submitted", `run_id "${req.run_id}" has already been submitted for this agent`);
    }
    logger.error("attribution_insert_failed", {
      runId: req.run_id,
      agentId: req.agent_id,
      error: insertError.message,
    });
    throw new AppError(502, "database_error", `Attribution record insert failed: ${insertError.message}`);
  }

  return {
    run_id: req.run_id,
    agent_id: req.agent_id,
    attribution_status: "pending",
    submitted_at: submittedAt,
  };
}
