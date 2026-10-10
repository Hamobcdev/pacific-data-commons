-- ============================================================================
-- PDQE Stage 02 — Migration 1 of 1
-- Secure Ingestion — Five-Layer Upload Security Pipeline (Decision 58)
--
-- Every file upload into PDQE passes through five layers before any Claude
-- API call:
--   1. File type whitelist      — accept only PDF, CSV, JSON, XLSX, DOCX, TXT, XML
--   2. Content sanitisation     — strip executables, macros, metadata (Stage 02b)
--   3. Claude prompt construction — content wrapped as data, injection-rejection (P9)
--   4. Output schema validation — strict JSON schema, reject non-conforming output
--   5. Human review gate        — no stored/deployed content without approval
--
-- pdqe.ingestion_events is the mutable "current state of this upload attempt"
-- record — same role as pdqe.sources in Stage 01.
-- pdqe.upload_security_log is the append-only per-layer audit trail — same
-- role as pdqe.audit_log in Stage 01.
--
-- Schema only. No production Claude API calls, no billing logic — this stage
-- is schema, interfaces, and stubs (see Stage 02 deliverables).
--
-- Reference: PDQE_MASTER_BUILD.md, Stage 02 startup prompt, CLAUDE.md Decision 58, P9
-- Depends on: 20261008000001_pdqe_schema_and_roles.sql
--             20261008000002_pdqe_sources.sql
--             20261008000003_pdqe_pipeline_state.sql
--             20261008000004_pdqe_audit_log.sql
-- Author: Anthony Williams / Synergy Blockchain Pacific
-- Date: 2026-10-08
--
-- ADDITIVE ONLY — does not alter any existing PDQE or PDC tables
-- ============================================================================

-- ── 1. Security layer enumeration ────────────────────────────────────────────

CREATE TYPE pdqe.security_layer AS ENUM (
  'LAYER1_WHITELIST',
  'LAYER2_SANITISATION',
  'LAYER3_PROMPT_CONSTRUCTION',
  'LAYER4_SCHEMA_VALIDATION',
  'LAYER5_HUMAN_REVIEW'
);

COMMENT ON TYPE pdqe.security_layer IS
  'The five mandatory layers of the PDQE upload security pipeline (Decision 58).
   All five are non-negotiable — no file reaches a Claude API call without
   passing Layer 1 through Layer 4, and no formatted output is stored or
   deployed without passing Layer 5.';

-- ── 2. pdqe.ingestion_events table ───────────────────────────────────────────
-- One row per upload attempt. Mutable — tracks current pipeline position.
-- Every attempt is recorded, including files rejected at Layer 1, so the
-- registry has a full record of what was submitted, not just what passed.

CREATE TABLE pdqe.ingestion_events (
  -- Primary key
  ingestion_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which source this upload belongs to
  source_id            UUID NOT NULL REFERENCES pdqe.sources(source_id) ON DELETE CASCADE,

  -- File identity (as submitted — untrusted input, P9)
  file_name            TEXT NOT NULL
                       CHECK (char_length(trim(file_name)) >= 1),
  file_extension       TEXT NOT NULL,   -- as submitted, lowercased by caller; not trusted until Layer 1 passes
  declared_mime_type   TEXT,
  file_size_bytes      BIGINT
                       CHECK (file_size_bytes IS NULL OR file_size_bytes > 0),

  -- Pricing context (Decision 27) — surcharge flag only; billing logic is a later stage
  is_scanned_pdf       BOOLEAN NOT NULL DEFAULT FALSE,

  -- Layer 1 result (set automatically by trigger — see section 4)
  layer1_passed        BOOLEAN,

  -- Overall pipeline status for this upload attempt
  status               TEXT NOT NULL DEFAULT 'RECEIVED'
                       CHECK (status IN (
                         'RECEIVED',
                         'LAYER1_REJECTED',
                         'LAYER2_SANITISING',
                         'LAYER2_FAILED',
                         'LAYER3_PROMPT_READY',
                         'LAYER3_FAILED',
                         'LAYER4_VALIDATING',
                         'LAYER4_FAILED',
                         'PENDING_HUMAN_REVIEW',
                         'APPROVED',
                         'REJECTED'
                       )),
  rejection_reason     TEXT,

  -- Set after Layer 2 sanitisation produces a canonical artifact
  content_hash         TEXT,

  -- Provenance
  registered_by        UUID NOT NULL REFERENCES auth.users(id),

  -- Audit
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE pdqe.ingestion_events IS
  'PDQE Secure Ingestion — one row per upload attempt into the five-layer
   security pipeline (Decision 58). Mutable: tracks current layer/status.
   Every attempt is recorded, including Layer 1 rejections, for accountability
   (CLAUDE.md Decision 58 — the $25 fee and this record together trace
   malicious submissions to their origin). Layer-by-layer history lives in
   pdqe.upload_security_log, not here.';

COMMENT ON COLUMN pdqe.ingestion_events.file_extension IS
  'As submitted by the caller. Untrusted until pdqe.validate_file_type()
   confirms it is in the Layer 1 whitelist (PDF, CSV, JSON, XLSX, DOCX, TXT, XML).';

COMMENT ON COLUMN pdqe.ingestion_events.layer1_passed IS
  'Set automatically by trg_ingestion_events_layer1 on INSERT/UPDATE of
   file_extension. Not settable directly by application code.';

-- Fast lookups by source (ingestion history for a source)
CREATE INDEX idx_pdqe_ingestion_events_source
  ON pdqe.ingestion_events (source_id, created_at DESC);

-- Fast lookups by status (pipeline / review-queue dashboards)
CREATE INDEX idx_pdqe_ingestion_events_status
  ON pdqe.ingestion_events (status);

-- Reuse the updated_at trigger function defined in migration 20261008000002
CREATE TRIGGER trg_pdqe_ingestion_events_updated_at
  BEFORE UPDATE ON pdqe.ingestion_events
  FOR EACH ROW EXECUTE FUNCTION pdqe.set_updated_at();

-- ── 3. pdqe.upload_security_log table ────────────────────────────────────────
-- Append-only. One row per layer-check event per ingestion attempt.
-- Same append-only guarantee as pdqe.audit_log: no UPDATE/DELETE policy for
-- any role, plus a trigger guard as a belt-and-suspenders backstop.

CREATE TABLE pdqe.upload_security_log (
  -- Primary key — monotonically increasing for ordered log scans
  log_id            BIGSERIAL PRIMARY KEY,

  -- Which ingestion attempt and layer this event belongs to
  ingestion_id      UUID NOT NULL REFERENCES pdqe.ingestion_events(ingestion_id) ON DELETE CASCADE,
  layer             pdqe.security_layer NOT NULL,

  -- Result
  passed            BOOLEAN NOT NULL,

  -- Structured detail. P9: this is data — never executed, never interpreted
  -- as instructions. Layer 3 prompt text itself is never stored here raw;
  -- only metadata about the check (e.g. template version, token count).
  detail            JSONB NOT NULL DEFAULT '{}',

  -- Error tracking (populated only when passed = FALSE)
  error_code        TEXT,
  error_message     TEXT,

  checked_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE pdqe.upload_security_log IS
  'Append-only log of every one of the five security-layer checks run against
   every PDQE upload attempt (Decision 58). No UPDATE or DELETE is permitted
   by any role (RLS + trigger guard — same pattern as pdqe.audit_log).
   detail is JSONB — treat as data, never execute (P9).';

-- Fast lookups by ingestion attempt (full layer history for one file)
CREATE INDEX idx_pdqe_upload_security_log_ingestion
  ON pdqe.upload_security_log (ingestion_id, checked_at);

-- Fast lookups by layer (e.g. find all Layer 5 pending-review events)
CREATE INDEX idx_pdqe_upload_security_log_layer
  ON pdqe.upload_security_log (layer, checked_at DESC);

-- ── 4. Layer 1 enforcement ────────────────────────────────────────────────────
-- Deterministic, SQL-side whitelist check (file type whitelist must not rely
-- on application code alone). Accepts only the seven whitelisted types.

CREATE OR REPLACE FUNCTION pdqe.validate_file_type(p_extension TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(p_extension)) = ANY (
    ARRAY['pdf', 'csv', 'json', 'xlsx', 'docx', 'txt', 'xml']
  );
$$;

COMMENT ON FUNCTION pdqe.validate_file_type IS
  'Layer 1 whitelist check (Decision 58). Returns TRUE only for the seven
   whitelisted file types: PDF, CSV, JSON, XLSX, DOCX, TXT, XML.
   Case-insensitive. Everything else is rejected at the gate.';

-- BEFORE INSERT/UPDATE trigger: classify every ingestion_events row against
-- the Layer 1 whitelist. Runs on every attempt — rejected files are still
-- recorded, never silently dropped.
CREATE OR REPLACE FUNCTION pdqe.enforce_layer1_whitelist()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.layer1_passed := pdqe.validate_file_type(NEW.file_extension);

  IF NOT NEW.layer1_passed THEN
    NEW.status := 'LAYER1_REJECTED';
    NEW.rejection_reason := format(
      'File type ''%s'' is not permitted. Layer 1 whitelist: PDF, CSV, JSON, XLSX, DOCX, TXT, XML.',
      NEW.file_extension
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ingestion_events_layer1
  BEFORE INSERT OR UPDATE OF file_extension ON pdqe.ingestion_events
  FOR EACH ROW EXECUTE FUNCTION pdqe.enforce_layer1_whitelist();

COMMENT ON TRIGGER trg_ingestion_events_layer1 ON pdqe.ingestion_events IS
  'Classifies every ingestion attempt against the Layer 1 whitelist on
   insert (and on any later correction of file_extension). Sets
   layer1_passed and, on rejection, status = LAYER1_REJECTED. Never blocks
   the INSERT itself — rejected attempts are recorded, not discarded, so the
   registry retains a full accountability trail (Decision 58).';

-- ── 5. Append-to-log convenience function ────────────────────────────────────
-- Application code uses this rather than writing INSERT directly.
-- SECURITY DEFINER so the pipeline service can write log records regardless
-- of the calling role.

CREATE OR REPLACE FUNCTION pdqe.log_security_check(
  p_ingestion_id    UUID,
  p_layer           pdqe.security_layer,
  p_passed          BOOLEAN,
  p_detail          JSONB DEFAULT '{}',
  p_error_code      TEXT  DEFAULT NULL,
  p_error_message   TEXT  DEFAULT NULL
)
RETURNS pdqe.upload_security_log
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row pdqe.upload_security_log;
BEGIN
  INSERT INTO pdqe.upload_security_log (
    ingestion_id, layer, passed, detail, error_code, error_message
  ) VALUES (
    p_ingestion_id, p_layer, p_passed, p_detail, p_error_code, p_error_message
  ) RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION pdqe.log_security_check IS
  'Convenience function for appending to pdqe.upload_security_log.
   SECURITY DEFINER — pipeline service can write log records regardless of
   calling role. Use this function rather than raw INSERT; never UPDATE or
   DELETE upload_security_log rows.';

-- Automatically log the Layer 1 result for every ingestion attempt, so
-- Layer 1 history exists in upload_security_log even if the application
-- layer never calls log_security_check() itself.
CREATE OR REPLACE FUNCTION pdqe.log_layer1_result()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pdqe.log_security_check(
    NEW.ingestion_id,
    'LAYER1_WHITELIST',
    NEW.layer1_passed,
    jsonb_build_object('file_name', NEW.file_name, 'file_extension', NEW.file_extension),
    CASE WHEN NEW.layer1_passed THEN NULL ELSE 'LAYER1_WHITELIST_REJECTED' END,
    CASE WHEN NEW.layer1_passed THEN NULL ELSE NEW.rejection_reason END
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ingestion_events_log_layer1
  AFTER INSERT ON pdqe.ingestion_events
  FOR EACH ROW EXECUTE FUNCTION pdqe.log_layer1_result();

-- ── 6. Append-only trigger guard — upload_security_log ───────────────────────
-- Belt-and-suspenders: even if a role somehow bypasses RLS, this trigger
-- prevents UPDATE and DELETE at the trigger level (same pattern as audit_log).

CREATE OR REPLACE FUNCTION pdqe.prevent_upload_security_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION
      'PDQE upload_security_log is append-only. UPDATE is not permitted. '
      'log_id: %, layer: %', OLD.log_id, OLD.layer;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'PDQE upload_security_log is append-only. DELETE is not permitted. '
      'log_id: %, layer: %', OLD.log_id, OLD.layer;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_pdqe_upload_security_log_immutable
  BEFORE UPDATE OR DELETE ON pdqe.upload_security_log
  FOR EACH ROW EXECUTE FUNCTION pdqe.prevent_upload_security_log_mutation();

COMMENT ON TRIGGER trg_pdqe_upload_security_log_immutable ON pdqe.upload_security_log IS
  'Append-only guard. Fires BEFORE UPDATE or DELETE. Always raises EXCEPTION.
   Works in conjunction with RLS (no UPDATE/DELETE policies) for
   belt-and-suspenders immutability.';

-- ── 7. Row Level Security — ingestion_events ─────────────────────────────────

ALTER TABLE pdqe.ingestion_events ENABLE ROW LEVEL SECURITY;

-- pdqe_admin: full access
CREATE POLICY "pdqe_admin_all_ingestion_events"
  ON pdqe.ingestion_events
  FOR ALL
  TO pdqe_admin
  USING (true)
  WITH CHECK (true);

-- pdqe_reviewer: read-only (human review queue reads from here, decides via
-- audit_log / upload_security_log actions)
CREATE POLICY "pdqe_reviewer_read_ingestion_events"
  ON pdqe.ingestion_events
  FOR SELECT
  TO pdqe_reviewer
  USING (true);

-- pdqe_provider: read their own submissions only (Stage 11; mirrors
-- pdqe_provider_own_sources from Stage 01)
CREATE POLICY "pdqe_provider_own_ingestion_events"
  ON pdqe.ingestion_events
  FOR SELECT
  TO pdqe_provider
  USING (registered_by = auth.uid());

-- pdqe_reader: no access (no policy = deny by default under RLS)

-- service_role: full bypass
CREATE POLICY "service_role_all_ingestion_events"
  ON pdqe.ingestion_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 8. Row Level Security — upload_security_log ──────────────────────────────

ALTER TABLE pdqe.upload_security_log ENABLE ROW LEVEL SECURITY;

-- READ policies only (no WRITE policies for any non-service role → inserts
-- go through pdqe.log_security_check() SECURITY DEFINER; no UPDATE/DELETE
-- policy exists for any role).

CREATE POLICY "pdqe_admin_read_upload_security_log"
  ON pdqe.upload_security_log
  FOR SELECT
  TO pdqe_admin
  USING (true);

CREATE POLICY "pdqe_reviewer_read_upload_security_log"
  ON pdqe.upload_security_log
  FOR SELECT
  TO pdqe_reviewer
  USING (layer = 'LAYER5_HUMAN_REVIEW');

CREATE POLICY "service_role_upload_security_log"
  ON pdqe.upload_security_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 9. Grants ─────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON pdqe.ingestion_events TO pdqe_admin;
GRANT SELECT ON pdqe.ingestion_events TO pdqe_reviewer;
GRANT SELECT ON pdqe.ingestion_events TO pdqe_provider;
GRANT ALL ON pdqe.ingestion_events TO service_role;

GRANT SELECT ON pdqe.upload_security_log TO pdqe_admin, pdqe_reviewer;
GRANT ALL ON pdqe.upload_security_log TO service_role;
GRANT USAGE ON SEQUENCE pdqe.upload_security_log_log_id_seq TO service_role;

GRANT EXECUTE ON FUNCTION pdqe.validate_file_type TO service_role, pdqe_admin, pdqe_provider;
GRANT EXECUTE ON FUNCTION pdqe.log_security_check TO service_role, pdqe_admin;
