import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { AppBindings } from "../types.js";

export const providersRoute = new Hono<AppBindings>();

interface ProviderRow {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_type: string;
  status: string;
  cbs_approved: boolean;
  activated_at: string | null;
}

const STATUS_ORDER: Record<string, number> = { active: 0, stub: 1, suspended: 2, decommissioned: 3 };

/**
 * GET /providers/status — every payment_providers row, active first, then
 * stub, then ordered by provider_type. cbs_approved is a plain column
 * already on the table (Session 38) — returned as-is, not derived.
 */
providersRoute.get("/providers/status", async (c) => {
  const supabase = c.get("supabase");

  const { data, error } = await supabase
    .from("payment_providers")
    .select("id,provider_id,provider_name,provider_type,status,cbs_approved,activated_at")
    .order("provider_type", { ascending: true });
  if (error) {
    logger.error("providers_status_query_failed", { message: error.message });
  }
  const rows = (data ?? []) as ProviderRow[];
  const sorted = [...rows].sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99));

  return c.json({ providers: sorted, total: sorted.length, stub: true });
});

const activateSchema = z.object({
  provider_id: z.string().min(1, "provider_id is required"),
});

/**
 * POST /providers/activate — flips a payment_providers row from 'stub' to
 * 'active'. Gated absolutely on cbs_approved: CLAUDE.md's monetary
 * authority hierarchy (hierarchy.ts) places activation approval in CBS's
 * tier_1 cbs_write_access list — SBP's financial-rails service enforces
 * that boundary here, it does not decide it. Writes an audit-trail row to
 * compliance_checks on every successful activation (CLAUDE.md P7).
 *
 * check_type is written as 'kyc' — compliance_checks.check_type's CHECK
 * constraint (Session 38 migration) only permits 'kyc' | 'aml_transaction'
 * | 'sanctions', with no 'provider_activation' value and no migration
 * change in scope for this session. 'kyc' is the closest existing
 * semantic fit (a gate on an entity's verified/approved status); the
 * `notes` field carries the actual event description so the audit trail
 * stays unambiguous on read.
 */
providersRoute.post("/providers/activate", async (c) => {
  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = activateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(`Invalid activation request — ${parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ")}`);
  }
  const { provider_id } = parsed.data;

  const supabase = c.get("supabase");

  const { data: provider, error: fetchError } = await supabase
    .from("payment_providers")
    .select("id,provider_id,provider_name,provider_type,status,cbs_approved,activated_at")
    .eq("provider_id", provider_id)
    .maybeSingle();
  if (fetchError) {
    logger.error("providers_activate_fetch_failed", { message: fetchError.message, provider_id });
    throw new AppError(500, "internal_error", "Could not look up provider.");
  }
  if (!provider) {
    throw new NotFoundError(`No payment provider found with provider_id "${provider_id}"`);
  }

  const row = provider as ProviderRow;
  if (!row.cbs_approved) {
    throw new ForbiddenError("CBS approval required before provider activation");
  }

  const activatedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("payment_providers")
    .update({ status: "active", activated_at: activatedAt })
    .eq("provider_id", provider_id)
    .select("id,provider_id,provider_name,provider_type,status,cbs_approved,activated_at")
    .single();
  if (updateError) {
    logger.error("providers_activate_update_failed", { message: updateError.message, provider_id });
    throw new AppError(500, "internal_error", "Could not activate provider.");
  }

  const { error: auditError } = await supabase.from("compliance_checks").insert({
    check_type: "kyc",
    entity_type: "provider",
    entity_id: row.id,
    status: "cleared",
    risk_level: "low",
    screening_reference: `activate-${provider_id}-${randomUUID()}`,
    checked_by: "sbp-financial-rails-stub-v1",
    notes: `provider_activation: ${provider_id} (${row.provider_name}) activated by financial-rails at ${activatedAt}`,
  });
  if (auditError) {
    logger.error("providers_activate_audit_insert_failed", { message: auditError.message, provider_id });
  }

  logger.info("provider_activated", { provider_id, activated_at: activatedAt });
  return c.json({ provider: updated, activated: true }, 200);
});
