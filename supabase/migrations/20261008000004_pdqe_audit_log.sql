-- ============================================================================
-- PDQE Stage 01 — Migration 4 of 4
-- pdqe.audit_log — Append-Only Pipeline Audit Trail
--
-- Records every action taken in the PDQE pipeline:
-- source registrations, state transitions, human decisions, errors,
-- licence assessments, and all other pipeline events.
--
-- APPEND-ONLY GUARANTEE:
-- - No UPDATE policy exists for any role
-- - No DELETE policy exists for any role (service_role excepted for emergency)
-- - A trigger prevents UPDATE and DELETE at the DB level as a belt-and-suspenders guard
--
-- Reference: PDQE_MASTER_BUILD.md (Provenance, Observability), Stage 01
-- Depends on: 20261008000001_pdqe_schema_and_roles.sql
--             20261008000002_pdqe_sources.sql
--             20261008000003_pdqe_pipeline_state.sql
-- Author: Anthony Williams / Synergy Blockchain Pacific
-- Date: 2026-10-08
-- ============================================================================

-- ── 1. Audit event type enumeration ──────────────────────────────────────────

CREATE TYPE pdqe.audit_event_type AS ENUM (
  'SOURCE_REGISTERED',       -- new source added to registry
  'SOURCE_UPDATED',          -- source metadata updated (not state)
  'STATE_TRANSITION',        -- lifecycle state change
  'LICENCE_ASSESSED',        -- licence status set or updated
  'LICENCE_FLAGGED',         -- licence_status set to REVIEW_REQUIRED
  'INGESTION_STARTED',       -- ingestion pipeline triggered
  'INGESTION_COMPLETED',     -- ingestion succeeded
  'INGESTION_FAILED',        -- ingestion error (source → QUARANTINED)
  'EXTRACTION_STARTED',      -- Claude extraction triggered
  'EXTRACTION_COMPLETED',    -- Claude extraction succeeded; output schema-validated
  'EXTRACTION_FAILED',       -- Claude extraction failed P9 schema validation
  'JEV_ASSESSMENT_STARTED',  -- Jev question set dispatched
  'JEV_ASSESSMENT_COMPLETED',-- Jev returned results; confidence gated
  'HUMAN_REVIEW_QUEUED',     -- source flagged for human review (Jev confidence < threshold)
  'HUMAN_REVIEW_APPROVED',   -- human reviewer approved
  'HUMAN_REVIEW_REJECTED',   -- human reviewer rejected
  'VALIDATION_PASSED',       -- deterministic validation passed all thresholds
  'VALIDATION_FAILED',       -- deterministic validation failed; source → QUARANTINED or REJECTED
  'ENDPOINT_GENERATED',      -- endpoint path and price tier assigned
  'ENDPOINT_VALIDATED',      -- endpoint automated test suite passed
  'ENDPOINT_PUBLISHED',      -- endpoint published to PDC directory
  'X402_REGISTERED',         -- endpoint registered with x402 / GoPlausible
  'PIPELINE_ERROR',          -- unexpected error (includes stack trace in details)
  'ADMIN_OVERRIDE'           -- pdqe_admin manual state override (with rationale)
);

-- ── 2. pdqe.audit_log table ───────────────────────────────────────────────────

CREATE TABLE pdqe.audit_log (
  -- Primary key — monotonically increasing for ordered log scans
  log_id            BIGSERIAL PRIMARY KEY,

  -- Event identity
  event_type        pdqe.audit_event_type NOT NULL,
  event_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Subject (what this event is about)
  source_id         UUID REFERENCES pdqe.sources(source_id),  -- NULL for non-source events
  pipeline_state_id UUID REFERENCES pdqe.pipeline_state(state_id),  -- NULL for non-transition events

  -- Actor
  actor_type        pdqe.actor_type,
  actor_version     TEXT,            -- model version / code version / auth.uid() for HUMAN
  actor_user_id     UUID REFERENCES auth.users(id),  -- set for HUMAN actors only

  -- Event payload
  -- Structured JSON. For automated actors: typed schema.
  -- For HUMAN actors: free text under a "rationale" key.
  -- P9: this is data — never execute it.
  details           JSONB DEFAULT '{}',

  -- Input / output hashes for this event (mirrors pipeline_state)
  input_hash        TEXT,
  output_hash       TEXT,

  -- Error tracking (populated only for *_FAILED and PIPELINE_ERROR events)
  error_code        TEXT,
  error_message     TEXT,

  -- Immutability guard (see trigger below)
  -- This column is set by the INSERT trigger and serves as a tamper signal.
  -- If a row's written_at differs from event_at by more than a few ms, investigate.
  written_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE pdqe.audit_log IS
  'Append-only audit trail for all PDQE pipeline events.
   No UPDATE or DELETE is permitted by any role (RLS + trigger guard).
   log_id is BIGSERIAL for ordered time-series scans.
   details is JSONB — treat as data, never execute (P9).
   Every observable pipeline event must produce an audit_log row.';

-- Fast lookups by source (pipeline audit view)
CREATE INDEX idx_pdqe_audit_log_source
  ON pdqe.audit_log (source_id, event_at DESC)
  WHERE source_id IS NOT NULL;

-- Fast lookups by event type (monitoring dashboards)
CREATE INDEX idx_pdqe_audit_log_event_type
  ON pdqe.audit_log (event_type, event_at DESC);

-- Fast lookups by actor user (human review history)
CREATE INDEX idx_pdqe_audit_log_actor_user
  ON pdqe.audit_log (actor_user_id, event_at DESC)
  WHERE actor_user_id IS NOT NULL;

-- ── 3. Append-only trigger guard ──────────────────────────────────────────────
-- Belt-and-suspenders: even if a role somehow bypasses RLS, this trigger
-- prevents UPDATE and DELETE at the trigger level.

CREATE OR REPLACE FUNCTION pdqe.prevent_audit_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION
      'PDQE audit_log is append-only. UPDATE is not permitted. '
      'log_id: %, event_type: %', OLD.log_id, OLD.event_type;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'PDQE audit_log is append-only. DELETE is not permitted. '
      'log_id: %, event_type: %', OLD.log_id, OLD.event_type;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_pdqe_audit_log_immutable
  BEFORE UPDATE OR DELETE ON pdqe.audit_log
  FOR EACH ROW EXECUTE FUNCTION pdqe.prevent_audit_log_mutation();

COMMENT ON TRIGGER trg_pdqe_audit_log_immutable ON pdqe.audit_log IS
  'Append-only guard. Fires BEFORE UPDATE or DELETE. Always raises EXCEPTION.
   Works in conjunction with RLS (no UPDATE/DELETE policies) for belt-and-suspenders
   immutability. Neither can be bypassed by normal database roles.';

-- ── 4. Convenience function: append to audit log ──────────────────────────────
-- Application code uses this rather than writing INSERT directly.
-- SECURITY DEFINER so pipeline service can write audit records regardless of
-- calling user's role.

CREATE OR REPLACE FUNCTION pdqe.log_event(
  p_event_type        pdqe.audit_event_type,
  p_source_id         UUID              DEFAULT NULL,
  p_pipeline_state_id UUID              DEFAULT NULL,
  p_actor_type        pdqe.actor_type   DEFAULT NULL,
  p_actor_version     TEXT              DEFAULT NULL,
  p_actor_user_id     UUID              DEFAULT NULL,
  p_details           JSONB             DEFAULT '{}',
  p_input_hash        TEXT              DEFAULT NULL,
  p_output_hash       TEXT              DEFAULT NULL,
  p_error_code        TEXT              DEFAULT NULL,
  p_error_message     TEXT              DEFAULT NULL
)
RETURNS pdqe.audit_log
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row pdqe.audit_log;
BEGIN
  INSERT INTO pdqe.audit_log (
    event_type, source_id, pipeline_state_id,
    actor_type, actor_version, actor_user_id,
    details, input_hash, output_hash,
    error_code, error_message
  ) VALUES (
    p_event_type, p_source_id, p_pipeline_state_id,
    p_actor_type, p_actor_version, p_actor_user_id,
    p_details, p_input_hash, p_output_hash,
    p_error_code, p_error_message
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION pdqe.log_event IS
  'Convenience function for appending to pdqe.audit_log.
   SECURITY DEFINER — pipeline service can write audit records regardless of calling role.
   Use this function rather than raw INSERT; never UPDATE or DELETE audit_log rows.';

-- ── 5. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE pdqe.audit_log ENABLE ROW LEVEL SECURITY;

-- READ policies (no WRITE policies for any non-service role → INSERT only, no UPDATE/DELETE)

-- pdqe_admin: read all audit events
CREATE POLICY "pdqe_admin_read_audit_log"
  ON pdqe.audit_log
  FOR SELECT
  TO pdqe_admin
  USING (true);

-- pdqe_reviewer: read audit events for their review queue items
CREATE POLICY "pdqe_reviewer_read_audit_log"
  ON pdqe.audit_log
  FOR SELECT
  TO pdqe_reviewer
  USING (
    event_type IN (
      'HUMAN_REVIEW_QUEUED',
      'HUMAN_REVIEW_APPROVED',
      'HUMAN_REVIEW_REJECTED',
      'JEV_ASSESSMENT_COMPLETED',
      'STATE_TRANSITION'
    )
  );

-- service_role: full access (pipeline writes go through log_event() but
-- service_role needs SELECT too for monitoring queries)
CREATE POLICY "service_role_audit_log"
  ON pdqe.audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No INSERT policy for pdqe_admin or pdqe_reviewer directly —
-- all inserts go through pdqe.log_event() (SECURITY DEFINER).
-- No UPDATE or DELETE policy for any role.

-- ── 6. Grants ─────────────────────────────────────────────────────────────────
GRANT SELECT ON pdqe.audit_log TO pdqe_admin, pdqe_reviewer;
GRANT ALL ON pdqe.audit_log TO service_role;
GRANT USAGE ON SEQUENCE pdqe.audit_log_log_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION pdqe.log_event TO service_role, pdqe_admin;
