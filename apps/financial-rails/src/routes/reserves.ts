import { Hono } from "hono";
import { logger } from "../lib/logger.js";
import type { AppBindings } from "../types.js";

export const reservesRoute = new Hono<AppBindings>();

interface PositionRow {
  provider_id: string;
  position_type: string;
  platform_node: string | null;
  amount_usdc_equivalent: number | null;
  status: string;
}

interface ProviderStatusRow {
  status: string;
}

/**
 * GET /reserves/summary — ecosystem-wide reserve totals. Reads
 * reserve_positions (grouped by position_type/platform_node) and
 * payment_providers (grouped by status). No rows are seeded in
 * reserve_positions yet (Session 38's migration seeds none — Type 3
 * escrow hasn't activated), so every total is genuinely 0 until CBS
 * confirms H1 and real positions are recorded via POST /escrow/record.
 */
reservesRoute.get("/reserves/summary", async (c) => {
  const supabase = c.get("supabase");

  const { data: positions, error: positionsError } = await supabase
    .from("reserve_positions")
    .select("provider_id,position_type,platform_node,amount_usdc_equivalent,status");
  if (positionsError) {
    logger.error("reserves_summary_positions_query_failed", { message: positionsError.message });
  }
  const positionRows = (positions ?? []) as PositionRow[];

  const { data: providers, error: providersError } = await supabase.from("payment_providers").select("status");
  if (providersError) {
    logger.error("reserves_summary_providers_query_failed", { message: providersError.message });
  }
  const providerRows = (providers ?? []) as ProviderStatusRow[];

  const sumByType = (positionType: string) => positionRows.filter((p) => p.position_type === positionType).reduce((total, p) => total + (p.amount_usdc_equivalent ?? 0), 0);

  const byNode: Record<string, number> = {};
  for (const row of positionRows) {
    if (!row.platform_node) continue;
    byNode[row.platform_node] = (byNode[row.platform_node] ?? 0) + (row.amount_usdc_equivalent ?? 0);
  }

  return c.json({
    total_usdc_in_ecosystem: positionRows.reduce((total, p) => total + (p.amount_usdc_equivalent ?? 0), 0),
    cbs_custodial_usdc: sumByType("usdc_custodial"),
    donor_grant_usdc: sumByType("donor_grant_wallet"),
    pending_conversion: sumByType("exchange_pending"),
    active_providers: providerRows.filter((p) => p.status === "active").length,
    stub_providers: providerRows.filter((p) => p.status === "stub").length,
    stub: true,
    last_updated: new Date().toISOString(),
    by_node: byNode,
  });
});

interface FullProviderRow {
  provider_id: string;
  provider_name: string;
  provider_type: string;
  status: string;
  cbs_approved: boolean;
}

interface FullPositionRow extends PositionRow {
  id: string;
  currency: string;
  amount: number;
}

/**
 * GET /reserves/by-provider — every payment_providers row with its
 * reserve_positions joined, grouped by provider_type. Two queries (not a
 * PostgREST `!inner`/embedded-resource join): both tables carry a
 * service-role-only RLS posture from Session 38 (no anon/authenticated
 * policy exists at all), and this service always queries with the service
 * role key, so there's no RLS-on-join pitfall to route around here (unlike
 * apps/directory-api's `providers` table — CLAUDE.md §26.1) — plain
 * separate queries keep the grouping logic explicit and simple.
 */
reservesRoute.get("/reserves/by-provider", async (c) => {
  const supabase = c.get("supabase");

  const { data: providers, error: providersError } = await supabase
    .from("payment_providers")
    .select("provider_id,provider_name,provider_type,status,cbs_approved");
  if (providersError) {
    logger.error("reserves_by_provider_providers_query_failed", { message: providersError.message });
  }
  const providerRows = (providers ?? []) as FullProviderRow[];

  const { data: positions, error: positionsError } = await supabase
    .from("reserve_positions")
    .select("id,provider_id,position_type,platform_node,currency,amount,amount_usdc_equivalent,status");
  if (positionsError) {
    logger.error("reserves_by_provider_positions_query_failed", { message: positionsError.message });
  }
  const positionRows = (positions ?? []) as FullPositionRow[];

  const grouped: Record<string, Array<FullProviderRow & { reserve_positions: FullPositionRow[] }>> = {};
  for (const provider of providerRows) {
    const entry = { ...provider, reserve_positions: positionRows.filter((p) => p.provider_id === provider.provider_id) };
    (grouped[provider.provider_type] ??= []).push(entry);
  }

  return c.json({ by_provider_type: grouped, stub: true });
});
