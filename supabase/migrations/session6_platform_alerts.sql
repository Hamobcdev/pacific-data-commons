-- ============================================================================
-- Pacific Data Commons — Session 6 Migration (platform_alerts alert_type)
-- Synergy Blockchain Pacific (SBP)
--
-- `platform_alerts` already exists (session1_migration.sql, DOMAIN 7). The
-- Session 6 prompt drafted a fresh CREATE TABLE, but that would collide
-- with the real table. Onboarding Step 6 (SBP-managed deploy path) needs to
-- raise a 'deployment_requested' alert so SBP's manual review queue picks
-- it up — that value doesn't exist in the Session 1 alert_type CHECK
-- constraint, so this migration adds it. Postgres has no ALTER TYPE ADD
-- VALUE for inline CHECK constraints (that's only for real enum types), so
-- the constraint is dropped and recreated with the extended list.
-- ============================================================================

ALTER TABLE platform_alerts
DROP CONSTRAINT IF EXISTS platform_alerts_alert_type_check;

ALTER TABLE platform_alerts
ADD CONSTRAINT platform_alerts_alert_type_check CHECK (alert_type IN (
  'endpoint_degraded', 'endpoint_down',
  'facilitator_unreachable', 'fee_threshold_crossed',
  'fee_overdue', 'dispute_flag_threshold',
  'cert_expiring', 'cert_revoked',
  'silver_threshold_reached', 'health_checker_down',
  'deployment_requested'
));
