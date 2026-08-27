-- ============================================================================
-- Hotfix — missing base table GRANTs on tables created after session1
--
-- Investigated after a report of continued RLS/permission failures in
-- directory-api's Postgres logs, including some AFTER
-- hotfix_rls_transaction_log.sql was applied. Two genuinely distinct
-- failure classes turned out to be involved, not one:
--
-- 1. "permission denied for table X" (pacific_events, pacific_tourism_stats,
--    directory_demand_signals, approved_external_sources,
--    agent_external_source_permissions, endpoint_integrity_events,
--    endpoint_update_notifications, endpoint_versions) — this is a
--    Postgres GRANT-level rejection, checked BEFORE row-level security is
--    even evaluated. Confirmed via pg_default_acl: this project's default
--    ACL for tables grants full SELECT/INSERT/UPDATE/DELETE to
--    anon/authenticated/service_role automatically only for tables created
--    by the `supabase_admin` role; tables created by the plain `postgres`
--    role only get DELETE/TRUNCATE/REFERENCES/TRIGGER by default — no
--    SELECT/INSERT/UPDATE. Every table from session1_migration.sql (run
--    through whatever tooling originally provisioned this project, as
--    supabase_admin) already has full grants; every table created since
--    via this session's `apply_migration` MCP tool (which connects as
--    plain `postgres`) has NONE. RLS policies on all 8 tables above are
--    already correctly scoped (confirmed via pg_policies) — they've simply
--    never been reachable, because the GRANT check that runs before RLS
--    was never satisfied. This migration adds the missing GRANTs to match
--    what each table's own existing RLS policies already intend: full
--    CRUD for service_role, SELECT-only for anon/authenticated (plus
--    endpoint_versions' authenticated INSERT, matching its
--    providers_insert_versions policy).
--
-- 2. transactions_log's repeated "new row violates row-level security
--    policy" error, observed as late as 80+ minutes AFTER
--    hotfix_rls_transaction_log.sql added a service_role-scoped ALL
--    policy — decisively NOT explained by a missing policy or grant
--    (transactions_log already has full grants for every role, confirmed
--    both before and after that hotfix). Confirmed instead via pg_roles:
--    service_role has rolbypassrls = true in this project (the correct,
--    standard Supabase configuration). A role with BYPASSRLS can never
--    produce a row-level-security violation — Postgres skips RLS
--    evaluation for it entirely, regardless of policies. Since this error
--    kept recurring, the connection making these calls is provably NOT
--    authenticating as the genuine service_role. This is an infrastructure/
--    credential issue (directory-api's SUPABASE_SERVICE_KEY in Railway
--    most likely isn't the actual service-role secret — possibly the anon/
--    publishable key instead, which matches the exact grant pattern seen:
--    anon has the same full-grant/zero-grant split across old vs new
--    tables as whatever role has been failing), not something any SQL
--    migration can fix. NOT addressed here — see the accompanying report:
--    widening anon/authenticated's RLS policies to permit writes would let
--    anyone holding the public anon key write into transactions_log and
--    other tables, a security regression, not a fix. The GRANTs below are
--    still correct and necessary regardless of that separate issue — once
--    the real service_role key is in place, these grants are exactly what
--    it will need on the 8 tables affected by cause #1.
--
-- Also issues a PostgREST schema-cache reload: migrations applied via this
-- session's direct SQL execution path may not reliably fire the
-- notification PostgREST normally relies on to pick up new grants/policies
-- immediately (the same "postgres role vs supabase_admin role" distinction
-- as cause #1 above may also gate which DDL paths notify PostgREST).
-- ============================================================================

-- service_role: full CRUD, matching each table's existing "ALL" policy for
-- service_role (already present, already correctly scoped — only the base
-- grant was missing).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  agent_external_source_permissions,
  approved_external_sources,
  directory_demand_signals,
  endpoint_integrity_events,
  endpoint_update_notifications,
  endpoint_versions,
  pacific_events,
  pacific_tourism_stats
TO service_role;

-- anon + authenticated: SELECT only, matching each table's existing
-- public-read policy (agent_external_source_permissions,
-- approved_external_sources, directory_demand_signals, pacific_events,
-- pacific_tourism_stats all have a `TO anon, authenticated` SELECT policy
-- already; endpoint_update_notifications has no anon/authenticated policy
-- at all, so it's deliberately excluded here).
GRANT SELECT ON TABLE
  agent_external_source_permissions,
  approved_external_sources,
  directory_demand_signals,
  pacific_events,
  pacific_tourism_stats
TO anon, authenticated;

-- endpoint_integrity_events: authenticated-only SELECT, matching its
-- providers_own_integrity_events policy (no anon policy exists for it).
GRANT SELECT ON TABLE endpoint_integrity_events TO authenticated;

-- endpoint_versions: anon+authenticated SELECT (public_read_versions) plus
-- authenticated INSERT (providers_insert_versions) — the only one of these
-- 8 tables where authenticated has a write-scoped policy.
GRANT SELECT ON TABLE endpoint_versions TO anon;
GRANT SELECT, INSERT ON TABLE endpoint_versions TO authenticated;

-- Force PostgREST to pick up the grants (and any still-stale policy state)
-- immediately rather than waiting for its own cache TTL.
NOTIFY pgrst, 'reload schema';
