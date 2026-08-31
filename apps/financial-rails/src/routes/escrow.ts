import { Hono } from "hono";
import { z } from "zod";
import { AppError, NotFoundError, ValidationError } from "../lib/errors.js";
import { MONETARY_AUTHORITY_HIERARCHY } from "../lib/hierarchy.js";
import { PLATFORM_NODES } from "../lib/platformNodes.js";
import { logger } from "../lib/logger.js";
import type { AppBindings } from "../types.js";

export const escrowRoute = new Hono<AppBindings>();

interface ProviderStatusRow {
  status: string;
}

interface PositionSummaryRow {
  position_type: string;
  amount_usdc_equivalent: number | null;
  status: string;
}

/**
 * GET /escrow/summary — same shape as apps/directory-api's
 * GET /compliance/escrow/summary, but every field here is sourced live: the
 * node list and hierarchy come from this service's own single-source-of-
 * truth files (platformNodes.ts, hierarchy.ts) rather than a literal array
 * re-typed inline the way directory-api's version currently does. Both
 * versions read the same payment_providers/reserve_positions tables and
 * will report identical totals — directory-api's copy stays in place
 * until Session 39's dashboard (Component B) is confirmed working end to
 * end, at which point directory-api's compliance/escrow/summary route can
 * be pointed at this service instead of querying the tables directly.
 */
escrowRoute.get("/escrow/summary", async (c) => {
  const supabase = c.get("supabase");

  const { data: providers, error: providersError } = await supabase.from("payment_providers").select("status");
  if (providersError) {
    logger.error("escrow_summary_providers_query_failed", { message: providersError.message });
  }
  const providerRows = (providers ?? []) as ProviderStatusRow[];
  const activeProviders = providerRows.filter((p) => p.status === "active").length;
  const stubProviders = providerRows.filter((p) => p.status === "stub").length;

  const { data: positions, error: positionsError } = await supabase.from("reserve_positions").select("position_type,amount_usdc_equivalent,status");
  if (positionsError) {
    logger.error("escrow_summary_positions_query_failed", { message: positionsError.message });
  }
  const positionRows = (positions ?? []) as PositionSummaryRow[];
  const sumByType = (positionType: string) =>
    positionRows.filter((p) => p.position_type === positionType && p.status === "stub").reduce((total, p) => total + (p.amount_usdc_equivalent ?? 0), 0);

  return c.json({
    escrow_summary: {
      custodian: "Central Bank of Samoa",
      custodian_status: "stub",
      total_providers: providerRows.length,
      active_providers: activeProviders,
      stub_providers: stubProviders,
      usdc_in_custody_stub: sumByType("usdc_custodial"),
      fiat_reserves_stub: sumByType("fiat_reserve"),
      donor_grants_stub: sumByType("donor_grant_wallet"),
      stub: true,
      activation_note: "CBS Type 3 escrow activates when H1 regulatory position confirmed and CBS multisig wallet established",
    },
    cbs_oversight_nodes: PLATFORM_NODES.filter((n) => n.cbs_read_access).map((n) => n.node_id),
    monetary_authority_hierarchy: {
      tier_1: `${MONETARY_AUTHORITY_HIERARCHY.tier_1.name} — monetary authority, escrow custodian, KYC/AML final arbiter`,
      tier_2: `Licensed commercial banks (${MONETARY_AUTHORITY_HIERARCHY.tier_2.members.join(", ")}) — operate under CBS licence`,
      tier_3: `Mobile money providers (${MONETARY_AUTHORITY_HIERARCHY.tier_3.members.join(", ")}) — operate under tier 2 bank sponsorship`,
      tier_4: "SBP — infrastructure operator and payment router, no custody authority",
    },
  });
});

const VALID_POSITION_TYPES = ["usdc_custodial", "fiat_reserve", "donor_grant_wallet", "escrow_held", "exchange_pending"] as const;

const recordSchema = z.object({
  provider_id: z.string().min(1, "provider_id is required"),
  position_type: z.enum(VALID_POSITION_TYPES),
  currency: z.string().min(1, "currency is required"),
  amount: z.number(),
  amount_usdc_equivalent: z.number().optional(),
  platform_node: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * POST /escrow/record — creates a stub reserve_positions row. Used when
 * CBS confirms a USDC custody position (when live); every row this route
 * writes is still `status: 'stub'` today, same as reserve_positions.sql's
 * table default — there is no live escrow custodian yet (H1 gate).
 * provider_id existence is checked first so a bad id returns a clean 404
 * rather than a raw Postgres foreign-key-violation error.
 */
escrowRoute.post("/escrow/record", async (c) => {
  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = recordSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(`Invalid escrow record request — ${parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ")}`);
  }
  const input = parsed.data;

  const supabase = c.get("supabase");

  const { data: provider, error: fetchError } = await supabase.from("payment_providers").select("provider_id").eq("provider_id", input.provider_id).maybeSingle();
  if (fetchError) {
    logger.error("escrow_record_provider_lookup_failed", { message: fetchError.message, provider_id: input.provider_id });
    throw new AppError(500, "internal_error", "Could not look up provider.");
  }
  if (!provider) {
    throw new NotFoundError(`No payment provider found with provider_id "${input.provider_id}"`);
  }

  const { data: created, error: insertError } = await supabase
    .from("reserve_positions")
    .insert({
      provider_id: input.provider_id,
      position_type: input.position_type,
      currency: input.currency,
      amount: input.amount,
      amount_usdc_equivalent: input.amount_usdc_equivalent ?? null,
      platform_node: input.platform_node ?? null,
      status: "stub",
      notes: input.notes ?? null,
      recorded_by: "sbp-financial-rails-stub-v1",
    })
    .select()
    .single();
  if (insertError) {
    logger.error("escrow_record_insert_failed", { message: insertError.message, provider_id: input.provider_id });
    throw new AppError(500, "internal_error", "Could not record reserve position.");
  }

  logger.info("escrow_position_recorded", { provider_id: input.provider_id, position_type: input.position_type });
  return c.json({ reserve_position: created, stub: true }, 201);
});
