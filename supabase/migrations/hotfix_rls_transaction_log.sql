-- ============================================================================
-- Hotfix — transactions_log missing service_role write policy
--
-- Confirmed in production deploy logs: every settled paid-route query in
-- apps/directory-api fails to write its transaction log row (first
-- observed on GET /finance/fx, but logSettledDirectoryQuery() runs after
-- every route registered with PdcPaymentGate — search, provider, endpoint,
-- verify, wallet-balance, fx, pacific-brief, pacific/events, pacific-travel
-- — so it affects all of them identically):
--
--   "directory_query_log_failed: new row violates row-level security policy"
--
-- Confirmed live via pg_policy query against the pacific-data-commons
-- Supabase project: transactions_log has exactly one policy —
-- transactions_provider_read (SELECT, TO authenticated) — and nothing
-- covering INSERT for any role.
--
-- Root cause: session1_migration.sql enabled RLS on transactions_log on
-- the assumption noted in that file's own comment — "Service role (SBP
-- admin, server-side API) bypasses RLS. This is Supabase default
-- behaviour for the service role key" — so no explicit INSERT policy was
-- ever added for it. In practice, directory-api's inserts (issued with
-- SUPABASE_SERVICE_KEY, same client as every other write in that service —
-- see apps/directory-api/src/lib/supabase.ts) are being evaluated against
-- RLS and rejected, contradicting that assumption. Every table added since
-- Session 13 has instead granted an explicit
-- `FOR ALL TO service_role USING (true)` backstop rather than relying on
-- implicit bypass (see CLAUDE.md Section 26.1's providers-table RLS story,
-- and session19_external_sources.sql / session32_pacific_events.sql's
-- approved_external_sources / pacific_events tables for the same pattern).
-- transactions_log is the one table from the original Session 1 schema
-- that never got the same explicit policy — this migration brings it in
-- line with that now-established convention.
-- ============================================================================

CREATE POLICY "transactions_log_service_write" ON transactions_log
  FOR ALL TO service_role
  USING (true);
