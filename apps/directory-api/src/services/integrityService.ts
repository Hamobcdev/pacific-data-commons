import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CertifiedHashResponse, IntegrityEventRequest, IntegrityEventResponse } from "@pdc/shared-types";
import { AppError, NotFoundError, ValidationError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { sendIntegrityFlagEmail } from "../lib/email.js";
import type { Env } from "../lib/env.js";

const INTEGRITY_FLAG_THRESHOLD = 3;

/**
 * Certified hash lookup (Deliverable 2's getCertifiedHash, server side).
 * provenance_certificates is the source of truth (mirrors
 * verifyService.verifyCertificateByHash's pattern) — the newer
 * endpoints.dataset_content_hash column is a cache populated by
 * recordIntegrityEvent below, not read from here, so a cache write lagging
 * behind a fresh certificate can never make this lookup return a stale hash.
 */
export async function getCertifiedHashForEndpoint(
  supabase: SupabaseClient,
  endpointId: string,
): Promise<CertifiedHashResponse> {
  const { data, error } = await supabase
    .from("provenance_certificates")
    .select("dataset_content_hash")
    .eq("endpoint_id", endpointId)
    .eq("status", "active")
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError(502, "database_error", `Certified hash lookup failed: ${error.message}`);
  }

  return { dataset_content_hash: (data as { dataset_content_hash: string | null } | null)?.dataset_content_hash ?? null };
}

const integrityEventSchema = z.object({
  endpoint_id: z.string().uuid("endpoint_id must be a UUID"),
  check_trigger: z.enum(["agent_query", "health_cron", "manual"]),
  status: z.enum(["pass", "fail", "endpoint_unavailable", "no_cert_hash", "pending_recertification"]),
  expected_hash: z.string().nullable(),
  actual_hash: z.string().nullable(),
  agent_id: z.string().uuid().nullable(),
  transaction_blocked: z.boolean(),
});

function formatZodIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(body)"}: ${issue.message}`).join("; ");
}

/**
 * Records one integrity check (Deliverable 4). Order of writes: the event
 * row first (the audit log must contain every check that ran, regardless of
 * what happens next), then the endpoints row's rollup fields, then — only on
 * newly crossing the 3-strike threshold — the provider notification email.
 * A failure in the (best-effort) email step never rolls back or fails the
 * event/rollup writes that already succeeded.
 */
export async function recordIntegrityEvent(
  supabase: SupabaseClient,
  env: Env,
  rawBody: unknown,
): Promise<IntegrityEventResponse> {
  const parsed = integrityEventSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new ValidationError(`Invalid integrity event payload — ${formatZodIssues(parsed.error)}`);
  }
  const req: IntegrityEventRequest = parsed.data;

  const { data: eventRow, error: insertError } = await supabase
    .from("endpoint_integrity_events")
    .insert({
      endpoint_id: req.endpoint_id,
      check_trigger: req.check_trigger,
      status: req.status,
      expected_hash: req.expected_hash,
      actual_hash: req.actual_hash,
      agent_id: req.agent_id,
      transaction_blocked: req.transaction_blocked,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new AppError(502, "database_error", `Integrity event insert failed: ${insertError.message}`);
  }

  const { data: endpointRow, error: endpointReadError } = await supabase
    .from("endpoints")
    .select("id, title, provider_id, integrity_fail_count, integrity_flagged")
    .eq("id", req.endpoint_id)
    .maybeSingle();

  if (endpointReadError) {
    throw new AppError(502, "database_error", `Endpoint lookup failed: ${endpointReadError.message}`);
  }
  if (!endpointRow) {
    throw new NotFoundError(`No endpoint with id "${req.endpoint_id}"`);
  }

  const endpoint = endpointRow as {
    id: string;
    title: string;
    provider_id: string;
    integrity_fail_count: number;
    integrity_flagged: boolean;
  };

  // Only 'fail' strikes and 'pass' clears the strike count — 'endpoint_unavailable',
  // 'no_cert_hash', and 'pending_recertification' (Session 18, Decision 52)
  // are all inconclusive (no data was actually compared) and leave it
  // untouched, so a flaky endpoint can't dodge a real 3-strike flag by
  // timing out, an uncertified endpoint can't accumulate strikes at all,
  // and a provider mid-declared-update can't accidentally get flagged for
  // the exact update they're in the middle of legitimately making.
  let newFailCount = endpoint.integrity_fail_count;
  if (req.status === "fail") {
    newFailCount += 1;
  } else if (req.status === "pass") {
    newFailCount = 0;
  }

  const newlyFlagged = !endpoint.integrity_flagged && newFailCount >= INTEGRITY_FLAG_THRESHOLD;
  const now = new Date().toISOString();

  const updatePayload: Record<string, unknown> = {
    last_integrity_check: now,
    last_integrity_status: req.status,
    integrity_fail_count: newFailCount,
  };
  // Opportunistic cache refresh — only when this check actually resolved a
  // certified hash to compare against (see the module doc comment above).
  if (req.expected_hash) {
    updatePayload.dataset_content_hash = req.expected_hash;
  }
  if (newlyFlagged) {
    updatePayload.integrity_flagged = true;
    updatePayload.integrity_flagged_at = now;
  }

  const { error: updateError } = await supabase.from("endpoints").update(updatePayload).eq("id", req.endpoint_id);
  if (updateError) {
    throw new AppError(502, "database_error", `Endpoint integrity rollup update failed: ${updateError.message}`);
  }

  if (newlyFlagged) {
    const { data: providerRow, error: providerError } = await supabase
      .from("providers")
      .select("contact_email")
      .eq("id", endpoint.provider_id)
      .maybeSingle();

    if (providerError) {
      logger.error("integrity_flag_provider_lookup_failed", {
        endpointId: req.endpoint_id,
        providerId: endpoint.provider_id,
        error: providerError.message,
      });
    } else if (providerRow) {
      const provider = providerRow as { contact_email: string };
      await sendIntegrityFlagEmail(env, {
        providerEmail: provider.contact_email,
        endpointTitle: endpoint.title,
        expectedHash: req.expected_hash,
        actualHash: req.actual_hash,
      });
    }

    logger.warn("endpoint_integrity_flagged", {
      endpointId: req.endpoint_id,
      failCount: newFailCount,
    });
  }

  return {
    event_id: (eventRow as { id: string }).id,
    integrity_fail_count: newFailCount,
    integrity_flagged: endpoint.integrity_flagged || newlyFlagged,
  };
}
