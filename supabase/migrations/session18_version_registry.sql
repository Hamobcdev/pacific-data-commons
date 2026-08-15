-- Session 18 — Declared Dataset Update Flow and Version Registry (Decisions 52-53)
-- Legitimate provider updates must not trigger Session 17's integrity-fail block.

-- Endpoint version registry
-- Every version of a dataset is recorded here permanently
-- Version 1 (initial_certification) is inserted by the existing certificate
-- issuance flow (out of this session's scope — no such row exists yet for
-- either of the 2 live pilot endpoints, both still uncertified). Subsequent
-- versions are created through the declared update flow below.

CREATE TABLE IF NOT EXISTS endpoint_versions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id           UUID REFERENCES endpoints(id) ON DELETE CASCADE,
  version_number        INTEGER NOT NULL,
  -- Nullable, not NOT NULL as the brief's draft had it: at declare-update
  -- time (Route 1) the new hash is not known yet — that's the entire point
  -- of the two-step declare -> confirm flow. Only set once confirm-update
  -- (Route 2) verifies it against the provider's live /integrity route.
  -- NULL alongside certified_at IS NULL means "declared, not yet confirmed."
  dataset_content_hash  TEXT,
  update_category       TEXT CHECK (update_category IN (
                          'initial_certification',
                          'additive',
                          'correction',
                          'expansion',
                          'methodology_change'
                        )) NOT NULL,
  provider_change_description TEXT NOT NULL,
  -- What changed: structured for agent consumption
  records_added         INTEGER DEFAULT 0,
  records_modified      INTEGER DEFAULT 0,
  records_removed       INTEGER DEFAULT 0,
  new_parameters        TEXT[],           -- new fields/dimensions added
  date_range_extended   BOOLEAN DEFAULT FALSE,
  -- Certification state
  certified_at          TIMESTAMP WITH TIME ZONE,
  certified_by          TEXT DEFAULT 'sbp_auto', -- 'sbp_auto' or 'sbp_human'
  recertification_required BOOLEAN DEFAULT FALSE,
  -- On-chain anchor
  algorand_tx_id        TEXT,             -- tx ID of on-chain hash anchor
  -- Agent notification
  notification_sent_at  TIMESTAMP WITH TIME ZONE,
  notification_count    INTEGER DEFAULT 0,
  -- Meta
  declared_by           TEXT NOT NULL,    -- provider contact email
  declared_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(endpoint_id, version_number)
);

-- Agent update notification queue
-- Tracks which agent wallets need to be notified of dataset updates
-- Populated from transactions_log (endpoint_id -> algo_tx_id) joined
-- against agent_run_endpoints.endpoint_tx_ids (last 90 days) — see
-- apps/directory-api/src/services/notificationService.ts. agent_run_endpoints
-- has no endpoint_id column of its own (confirmed against the live schema),
-- so this join is required rather than a direct lookup.

CREATE TABLE IF NOT EXISTS endpoint_update_notifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_version_id   UUID REFERENCES endpoint_versions(id) ON DELETE CASCADE,
  endpoint_id           UUID REFERENCES endpoints(id) ON DELETE CASCADE,
  -- Recipient — agent wallet or human buyer email
  recipient_type        TEXT CHECK (recipient_type IN ('agent_wallet', 'buyer_email')) NOT NULL,
  agent_wallet          TEXT,             -- Algorand wallet address of agent
  buyer_email           TEXT,             -- email of human buyer (optional)
  -- Notification content
  notification_payload  JSONB NOT NULL,   -- structured for agent consumption
  -- Status
  status                TEXT CHECK (status IN (
                          'pending',
                          'sent',
                          'failed',
                          'skipped'       -- agent no longer active
                        )) DEFAULT 'pending',
  sent_at               TIMESTAMP WITH TIME ZONE,
  error_message         TEXT,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add pending_recertification state to endpoints
-- An endpoint in this state bypasses the integrity fail block
ALTER TABLE endpoints
  ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pending_recertification BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pending_recertification_since TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS latest_version_id UUID REFERENCES endpoint_versions(id);

-- Session 17's two status CHECK constraints did not anticipate this state —
-- both need 'pending_recertification' added, or every check run against a
-- mid-update endpoint fails at the database layer with a constraint
-- violation instead of recording the paused/non-blocking status Deliverable
-- 8 requires. Same pattern as Session 17 adding 'no_cert_hash' after the
-- fact.
ALTER TABLE endpoints DROP CONSTRAINT IF EXISTS endpoints_last_integrity_status_check;
ALTER TABLE endpoints ADD CONSTRAINT endpoints_last_integrity_status_check CHECK (
  last_integrity_status IN ('pass', 'fail', 'unchecked', 'endpoint_unavailable', 'no_cert_hash', 'pending_recertification')
);

ALTER TABLE endpoint_integrity_events DROP CONSTRAINT IF EXISTS endpoint_integrity_events_status_check;
ALTER TABLE endpoint_integrity_events ADD CONSTRAINT endpoint_integrity_events_status_check CHECK (
  status IN ('pass', 'fail', 'endpoint_unavailable', 'no_cert_hash', 'pending_recertification')
);

-- verification_queue.queue_type had no value for a declared-update
-- recertification review (expansion / methodology_change categories) —
-- 'renewal' is a different lifecycle event (Gold recert), not this.
ALTER TABLE verification_queue DROP CONSTRAINT IF EXISTS verification_queue_queue_type_check;
ALTER TABLE verification_queue ADD CONSTRAINT verification_queue_queue_type_check CHECK (
  queue_type IN ('new_provider', 'trust_upgrade', 'renewal', 'spot_check', 'revocation_investigation', 'recertification')
);

-- Reserved for the Silver-rating "pre-update votes preserved but marked
-- historical" behaviour (brief's update-category table, methodology_change
-- row) — NULL means "counts toward the endpoint's current version" for
-- every existing row. Populating this at rating-submission time and scoping
-- Silver-tier eligibility counting by it is follow-up work, not built this
-- session (both live in Session ~9's submit-rating.ts / dashboard trust-tier
-- logic, outside this session's declared-update deliverables) — flagged in
-- the session report rather than silently rewiring code this brief never
-- named.
ALTER TABLE community_ratings
  ADD COLUMN IF NOT EXISTS rated_for_version INTEGER;

-- RLS for endpoint_versions
ALTER TABLE endpoint_versions ENABLE ROW LEVEL SECURITY;

-- Public can read versions (version history is transparent)
CREATE POLICY "public_read_versions" ON endpoint_versions
  FOR SELECT TO anon, authenticated USING (true);

-- Providers can insert their own endpoint versions
CREATE POLICY "providers_insert_versions" ON endpoint_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    endpoint_id IN (
      SELECT e.id FROM endpoints e
      JOIN providers p ON e.provider_id = p.id
      WHERE p.contact_email = auth.email()
    )
  );

-- Service role full access
CREATE POLICY "service_role_versions" ON endpoint_versions
  FOR ALL TO service_role USING (true);

-- RLS for notifications
ALTER TABLE endpoint_update_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_notifications" ON endpoint_update_notifications
  FOR ALL TO service_role USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_endpoint_versions_endpoint_id
  ON endpoint_versions(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_endpoint_versions_declared_at
  ON endpoint_versions(declared_at DESC);
CREATE INDEX IF NOT EXISTS idx_update_notifications_status
  ON endpoint_update_notifications(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_update_notifications_endpoint_id
  ON endpoint_update_notifications(endpoint_id);
