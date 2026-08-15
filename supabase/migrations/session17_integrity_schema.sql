-- Session 17 — Automatic Integrity Checks on Agent Queries (Decisions 49-51)
-- Adds integrity tracking to endpoints + a full audit log of every check.

-- Add integrity tracking fields to endpoints table
ALTER TABLE endpoints
  ADD COLUMN IF NOT EXISTS last_integrity_check TIMESTAMP WITH TIME ZONE,
  -- 'no_cert_hash' included alongside the brief's original 4 values: an
  -- endpoint with no active certificate yet is a real, recurring status
  -- (not just a startup default), and recordIntegrityEvent() always writes
  -- whatever endpoint_integrity_events.status just produced into this
  -- column — a value the event table accepts but this constraint rejected
  -- would fail every write for an uncertified endpoint.
  ADD COLUMN IF NOT EXISTS last_integrity_status TEXT CHECK (
    last_integrity_status IN ('pass', 'fail', 'unchecked', 'endpoint_unavailable', 'no_cert_hash')
  ) DEFAULT 'unchecked',
  ADD COLUMN IF NOT EXISTS integrity_fail_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS integrity_flagged BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS integrity_flagged_at TIMESTAMP WITH TIME ZONE,
  -- Decision 51: field reserved this session. Enforcement logic is Phase 2.
  ADD COLUMN IF NOT EXISTS cultural_sovereignty_price_floor DECIMAL DEFAULT NULL,
  -- Cache of the currently active provenance_certificates.dataset_content_hash
  -- for this endpoint. provenance_certificates remains the source of truth
  -- (this column is populated opportunistically by recordIntegrityEvent, not
  -- read from directly by the certified-hash lookup — see
  -- apps/directory-api/src/services/integrityService.ts).
  ADD COLUMN IF NOT EXISTS dataset_content_hash TEXT;

-- Decision 49: Full integrity check audit log
CREATE TABLE IF NOT EXISTS endpoint_integrity_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id           UUID REFERENCES endpoints(id) ON DELETE CASCADE,
  checked_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  check_trigger         TEXT CHECK (check_trigger IN (
                          'agent_query',
                          'health_cron',
                          'manual'
                        )) NOT NULL,
  status                TEXT CHECK (status IN (
                          'pass',
                          'fail',
                          'endpoint_unavailable',
                          'no_cert_hash'
                        )) NOT NULL,
  expected_hash         TEXT,
  actual_hash           TEXT,
  agent_id              UUID REFERENCES agents(id) ON DELETE SET NULL,
  transaction_blocked   BOOLEAN DEFAULT FALSE,
  notes                 TEXT,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE endpoint_integrity_events ENABLE ROW LEVEL SECURITY;

-- providers has no user_id column — every other provider-scoped RLS policy
-- in session1_migration.sql keys off contact_email = auth.email() instead
-- (see e.g. line ~1013); matching that pattern rather than the brief's
-- p.user_id, which does not exist on this schema.
CREATE POLICY "providers_own_integrity_events" ON endpoint_integrity_events
  FOR SELECT TO authenticated
  USING (
    endpoint_id IN (
      SELECT e.id FROM endpoints e
      JOIN providers p ON e.provider_id = p.id
      WHERE p.contact_email = auth.email()
    )
  );

CREATE POLICY "service_role_integrity_events" ON endpoint_integrity_events
  FOR ALL TO service_role USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integrity_events_endpoint_id
  ON endpoint_integrity_events(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_integrity_events_checked_at
  ON endpoint_integrity_events(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_endpoints_integrity_flagged
  ON endpoints(integrity_flagged) WHERE integrity_flagged = TRUE;
