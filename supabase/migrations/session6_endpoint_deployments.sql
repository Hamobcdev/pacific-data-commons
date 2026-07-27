-- ============================================================================
-- Pacific Data Commons — Session 6 Migration (endpoint_deployments)
-- Synergy Blockchain Pacific (SBP)
--
-- The `endpoint_deployments` table already exists (session1_migration.sql,
-- DOMAIN 4) with RLS enabled but no policy — nothing outside the service
-- role could read it. The Session 6 prompt drafted a fresh CREATE TABLE for
-- this, but that would collide with the real table (different
-- deployment_type / status enums, no `notes` or `updated_at` columns). This
-- migration extends the real table instead of redefining it:
--   1. `notes` — free-text SBP reviewer notes shown back to the provider
--      once reviewed (not present in the Session 1 schema)
--   2. `updated_at` + trigger — so status transitions (pending -> deploying
--      -> live) are timestamped, matching the providers/endpoints pattern
--   3. A provider self-read RLS policy — providers can see the status of
--      their own deployment requests on the Step 7 completion screen and
--      future dashboard, mirroring endpoints_provider_read /
--      formatting_provider_access from session1_migration.sql
-- ============================================================================

ALTER TABLE endpoint_deployments
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE endpoint_deployments
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

DROP TRIGGER IF EXISTS endpoint_deployments_updated_at ON endpoint_deployments;
CREATE TRIGGER endpoint_deployments_updated_at
  BEFORE UPDATE ON endpoint_deployments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP POLICY IF EXISTS endpoint_deployments_provider_read ON endpoint_deployments;
CREATE POLICY endpoint_deployments_provider_read ON endpoint_deployments
  FOR SELECT TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE contact_email = auth.email()
    )
  );
