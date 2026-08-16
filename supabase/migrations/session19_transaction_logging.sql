-- ============================================================================
-- Session 19 — Transaction wiring fix
--
-- Supports two new writers:
--   1. apps/pilot-endpoint now logs every settled endpoint payment directly
--      to transactions_log (previously never wired — see
--      apps/pilot-endpoint/src/services/transactionLogger.ts) and needs an
--      atomic way to bump providers.total_queries_served, which nothing in
--      this codebase has ever incremented before now.
--   2. apps/sbp-agent now self-registers into `agents` at boot so it can
--      submit Decision 37 attribution records — see
--      apps/directory-api/src/services/agentSelfRegisterService.ts.
--
--      NOTE: self-registration deliberately does NOT upsert on a unique
--      operational_wallet constraint. The live `agents` table already has 6
--      rows (the Phase 2 first-party marketplace agent placeholders) that
--      all share one identical operational_wallet value — a seed/dummy
--      address, not six distinct real wallets. A unique constraint would
--      fail to apply against that existing data, and fixing it is a Phase 2
--      concern (each of those six needs its own real operational wallet
--      before it can actually run — sharing one wallet would make Decision
--      37 attribution/self-dealing detection unable to distinguish which
--      agent made which payment). Flagged for a future session; out of
--      scope here. agentSelfRegisterService.ts instead does a plain
--      select-by-operational_wallet then insert-if-missing, which is safe
--      at sbp-agent's single-instance, once-at-boot call pattern.
-- ============================================================================

-- Called once per successful paid data query (any tier) — mirrors
-- increment_tier12_accrual's existing pattern immediately below it in
-- session1_migration.sql, but total_queries_served counts every tier, not
-- just Tier 1-2.
CREATE OR REPLACE FUNCTION increment_provider_query_count(
  p_provider_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE providers
  SET total_queries_served = total_queries_served + 1
  WHERE id = p_provider_id;
END;
$$ LANGUAGE plpgsql;
