-- Tourism tables — role grants, matching pacific_events
--
-- Context: canary_x402_seed sweep on 2026-10-26 (07:01/07:07/07:16 UTC) hit
-- "permission denied for table tourism_*" on every Phase A tourism table
-- except pacific_events, surfaced to buyers as a 502 "database_error"
-- (apps/directory-api/src/services/tourism*.ts re-throws any Supabase
-- query error as AppError(502, "database_error", ...)).
--
-- Root cause: apps/directory-api's Supabase client (lib/supabase.ts,
-- createSupabaseClient()) authenticates as service_role, not anon —
-- confirmed via lib/env.ts (no SUPABASE_ANON_KEY field exists in this
-- service's env schema at all) and wrangler.toml's secrets list (only
-- SUPABASE_URL / SUPABASE_SERVICE_KEY). service_role bypasses RLS *policy*
-- evaluation, but still requires its own base table-level GRANT — that
-- grant was never issued for the 12 new CREATE TABLE statements in
-- 20261026000001_pacific_tourism_schema.sql. pacific_events (an
-- ALTER TABLE on a pre-existing table) already carried the full
-- service_role grant set, which is why /tourism/events/* was the one
-- working route.
--
-- The SELECT/INSERT/UPDATE/DELETE grant to service_role below was applied
-- directly to production (poiiwcbriqwczmppoevd) ahead of this migration
-- file, to restore the route immediately; this file exists to make that
-- change reproducible and version-controlled rather than live-only drift.
--
-- The anon/authenticated SELECT grants below were already present on all
-- 13 tables at investigation time (matching pacific_events already) —
-- included here for completeness/parity tracking, not because they fixed
-- anything live. All GRANT statements are idempotent.

GRANT SELECT ON TABLE public.tourism_accommodations        TO anon, authenticated;
GRANT SELECT ON TABLE public.tourism_activities             TO anon, authenticated;
GRANT SELECT ON TABLE public.tourism_destinations            TO anon, authenticated;
GRANT SELECT ON TABLE public.tourism_hazards                 TO anon, authenticated;
GRANT SELECT ON TABLE public.tourism_cultural_protocols       TO anon, authenticated;
GRANT SELECT ON TABLE public.tourism_transport                 TO anon, authenticated;
GRANT SELECT ON TABLE public.tourism_food_beverage               TO anon, authenticated;
GRANT SELECT ON TABLE public.tourism_markets                      TO anon, authenticated;
GRANT SELECT ON TABLE public.tourism_providers                     TO anon, authenticated;
GRANT SELECT ON TABLE public.tourism_health_infrastructure           TO anon, authenticated;
GRANT SELECT ON TABLE public.tourism_weddings                         TO anon, authenticated;
GRANT SELECT ON TABLE public.tourism_conference_venues                  TO anon, authenticated;
GRANT SELECT ON TABLE public.tourism_accessibility                        TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tourism_accommodations        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tourism_activities             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tourism_destinations            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tourism_hazards                 TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tourism_cultural_protocols       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tourism_transport                 TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tourism_food_beverage               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tourism_markets                      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tourism_providers                     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tourism_health_infrastructure           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tourism_weddings                         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tourism_conference_venues                  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tourism_accessibility                        TO service_role;
