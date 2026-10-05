-- Adds 'financial_intelligence' to the agents.agent_type CHECK constraint
-- (session6_1_agent_schema.sql) so the 7th first-party marketplace agent
-- (Financial Intelligence Agent — @pdc/shared-types' AGENT_REGISTRY.financial,
-- apps/agents/src/agents/financial.ts) can be inserted by
-- scripts/register-agents.ts, same as every other first-party agent_type
-- value. Postgres has no ALTER-in-place for CHECK constraints — drop and
-- recreate under the same auto-generated name, additive only, no existing
-- value removed or renamed, so no existing row can violate it. Same pattern
-- as session20_category_expansion.sql's endpoints.data_category expansion.
--
-- Constraint name assumed as Postgres's default <table>_<column>_check
-- naming (matching session20_category_expansion.sql's confirmed
-- endpoints_data_category_check) — not independently verified against the
-- live project; adjust the name below if the live constraint differs.
--
-- NOT auto-applied by this migration file landing in the repo — apply
-- manually against the Supabase project, same as every other migration in
-- this directory.

ALTER TABLE agents DROP CONSTRAINT agents_agent_type_check;

ALTER TABLE agents ADD CONSTRAINT agents_agent_type_check CHECK (agent_type IN (
  'trade_intelligence',
  'climate_risk',
  'fisheries_status',
  'agricultural_exports',
  'remittance_navigator',
  'grant_matcher',
  'financial_intelligence',
  'third_party'
));
