-- Phase C — adds market_vendor as an eighth tourism_providers.provider_category.
--
-- Existing constraint name (tourism_providers_provider_category_check) is
-- Postgres's default name for the unnamed inline CHECK in Phase A's
-- CREATE TABLE (20261026000001_pacific_tourism_schema.sql line 241) —
-- confirmed live via pg_constraint before dropping it, not assumed from
-- the migration file alone.
--
-- APPLIED via Supabase MCP on 2026-10-26, same session, after explicit
-- approval. This file documents the already-applied change for repo/DB
-- parity.

ALTER TABLE tourism_providers DROP CONSTRAINT tourism_providers_provider_category_check;
ALTER TABLE tourism_providers ADD CONSTRAINT tourism_providers_provider_category_check
  CHECK (provider_category IN (
    'accommodation','tour_operator','water_activities','transport',
    'food_beverage','conference_events','local_guide','market_vendor'
  ));
