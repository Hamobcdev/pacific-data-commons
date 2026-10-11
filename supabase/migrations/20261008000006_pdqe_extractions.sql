-- ============================================================================
-- PDQE Stage 03 — Migration 1 of 1
-- pdqe.extractions — Claude Extraction Output Store
--
-- Stores the result of every Claude API extraction run against a sanitised
-- ingestion event. Implements Stage 03 of the PDQE lifecycle:
--
--   INGESTED → (Stage 03) → EXTRACTED
--
-- P9 enforced throughout:
--   - raw_claude_output is JSONB — stored as data, never executed
--   - validated_output is JSONB — populated only after deterministic schema
--     validation passes (Layer 4)
--   - No extraction output becomes pipeline state without validation
--
-- Multi-document support:
--   - contributing_ingestion_ids UUID[] links related source documents to one
--     logical extraction when multiple artefacts synthesise one dataset
--
-- Provenance:
--   - provenance_map JSONB stores per-field evidence references
--     (document page / section / URL) as data
--   - input_content_hash links back to the sanitised content that was sent
--
-- Reference: PDQE_MASTER_BUILD.md, stages/03-claude-extraction.md, P9
-- Depends on: 20261008000001_pdqe_schema_and_roles.sql
--             20261008000002_pdqe_sources.sql
--             20261008000003_pdqe_pipeline_state.sql
--             20261008000004_pdqe_audit_log.sql
--             20261008000005_pdqe_ingestion_events.sql
-- Author: Anthony Williams / Synergy Blockchain Pacific
-- Date: 2026-10-11
--
-- ADDITIVE ONLY — does not alter any existing PDQE or PDC tables
-- ============================================================================

-- ── 1. Extraction status enumeration ─────────────────────────────────────────

CREATE TYPE pdqe.extraction_status AS ENUM (
  'PENDING',       -- queued, not yet sent to Claude
  'IN_PROGRESS',   -- Claude API call in flight
  'VALIDATED',     -- raw output passed Layer 4 schema validation
  'REJECTED',      -- raw output failed Layer 4 schema validation (stored for audit)
  'RETRY_NEEDED'   -- human reviewer requested re-extraction
);

COMMENT ON TYPE pdqe.extraction_status IS
  'Status of a single Claude extraction attempt.
   VALIDATED = Layer 4 passed; output is usable by Stage 04+.
   REJECTED = Layer 4 failed; raw_claude_output retained for audit.
   "LLM output is untrusted input" (P9) — nothing advances without VALIDATED.';

-- ── 2. pdqe.extractions table ────────────────────────────────────────────────

CREATE TABLE pdqe.extractions (
  -- Primary key
  extraction_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link back to the specific ingestion attempt this extraction is for
  ingestion_id                UUID NOT NULL REFERENCES pdqe.ingestion_events(ingestion_id) ON DELETE CASCADE,

  -- Denormalised source link — avoids a join on the hot pipeline query path
  source_id                   UUID NOT NULL REFERENCES pdqe.sources(source_id) ON DELETE CASCADE,

  -- Multi-document synthesis: which ingestion events contributed to this extraction
  -- Will be [ingestion_id] for single-document extractions; multiple entries for synthesis
  contributing_ingestion_ids  UUID[] NOT NULL DEFAULT '{}',

  -- ── Prompt provenance ──────────────────────────────────────────────────────
  schema_version              TEXT NOT NULL DEFAULT 'pdqe-extraction-v1',
  prompt_template_version     TEXT NOT NULL,  -- e.g. 'pdqe-extraction-v1' from PromptPayload

  -- SHA-256 of the sanitised content that was sent to Claude (hex)
  -- Links this extraction to the exact Layer 2 output that produced it
  input_content_hash          TEXT NOT NULL
                              CHECK (char_length(input_content_hash) = 64),

  -- ── Model provenance ──────────────────────────────────────────────────────
  model_id                    TEXT NOT NULL,  -- e.g. 'claude-sonnet-4-6'
  model_version               TEXT,           -- as returned by the API response

  -- ── Raw output (P9 — data, never instructions, never executed) ────────────
  -- Stored verbatim regardless of validation outcome so we have a full audit
  -- trail even for rejected runs
  raw_claude_output           JSONB NOT NULL,

  -- ── Validation result (Layer 4) ───────────────────────────────────────────
  status                      pdqe.extraction_status NOT NULL DEFAULT 'PENDING',
  rejection_reason            TEXT,  -- populated only when status = REJECTED

  -- ── Validated structured output ───────────────────────────────────────────
  -- Populated only when status = VALIDATED.
  -- This is the data that Stage 04+ (Jev qualification) consumes.
  validated_output            JSONB,

  -- ── Denormalised extraction fields (fast filtering for Stage 04+) ─────────
  -- Mirrors the validated_output JSONB fields for indexed queries.
  -- Populated only when status = VALIDATED.
  title                       TEXT,
  publisher_name              TEXT,
  source_type_extracted       TEXT,   -- raw TEXT because Stage 04 normalises to the enum
  candidate_domains           TEXT[], -- candidate domain labels (raw from Claude; Stage 04 qualifies)
  geographic_scope            TEXT[],
  published_at_extracted      TIMESTAMPTZ,
  licence_text                TEXT,
  licence_url                 TEXT,
  methodology                 TEXT,
  confidence                  FLOAT
                              CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0)),

  -- ── Provenance map ────────────────────────────────────────────────────────
  -- Per-field evidence references: { "title": {"source_ref": "p.1", "quote": "..."}, ... }
  -- Stored as JSONB — data, not instructions (P9).
  provenance_map              JSONB NOT NULL DEFAULT '{}',

  -- ── Variables and tables extracted ───────────────────────────────────────
  -- Structured sub-objects stored alongside validated_output.
  variables_extracted         JSONB NOT NULL DEFAULT '[]',  -- list of { name, unit, description, provenance }
  tables_extracted            JSONB NOT NULL DEFAULT '[]',  -- list of { table_ref, description, columns, row_count_estimate }

  -- ── Audit ─────────────────────────────────────────────────────────────────
  extraction_notes            TEXT,  -- human-readable notes about incomplete/conflicting input
  triggered_by                UUID REFERENCES auth.users(id),  -- NULL for automated pipeline runs
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE pdqe.extractions IS
  'PDQE Stage 03 — one row per Claude extraction attempt against a sanitised
   ingestion event. Stores both the raw Claude output (data, never executed —
   P9) and the Layer 4 validated structured output. Multi-document synthesis
   is supported via contributing_ingestion_ids. Stage 04 (Jev qualification)
   reads from validated_output + denormalised columns.';

COMMENT ON COLUMN pdqe.extractions.raw_claude_output IS
  'Verbatim JSON returned by the Claude API. P9: stored as JSONB data,
   never interpreted as instructions, never executed. Retained for all
   outcomes including REJECTED runs so the full pipeline history is auditable.';

COMMENT ON COLUMN pdqe.extractions.validated_output IS
  'Layer 4 validated structured extraction. Populated only when
   status = VALIDATED. This is the data Stage 04+ consumes. NULL for
   REJECTED runs — use raw_claude_output for audit in those cases.';

COMMENT ON COLUMN pdqe.extractions.contributing_ingestion_ids IS
  'For multi-document synthesis: all ingestion_ids whose sanitised content
   contributed to this extraction. For single-document extraction this will
   equal [ingestion_id]. Stage 03 multi-document support (03-claude-extraction.md).';

COMMENT ON COLUMN pdqe.extractions.provenance_map IS
  'Per-field evidence map: { "field_name": { "source_ref": "page/section/URL",
   "quote": "verbatim text" } }. Stored as JSONB data — never executed (P9).
   Stage 03 provenance requirement.';

-- ── 3. Indexes ───────────────────────────────────────────────────────────────

-- Pipeline queue: find PENDING / IN_PROGRESS extractions quickly
CREATE INDEX idx_pdqe_extractions_status
  ON pdqe.extractions (status, created_at);

-- Source history: all extractions for a source
CREATE INDEX idx_pdqe_extractions_source
  ON pdqe.extractions (source_id, created_at DESC);

-- Ingestion link: all extractions for a specific ingestion attempt
CREATE INDEX idx_pdqe_extractions_ingestion
  ON pdqe.extractions (ingestion_id);

-- Stage 04 filter: only VALIDATED extractions, ordered for batch processing
CREATE INDEX idx_pdqe_extractions_validated
  ON pdqe.extractions (status, source_id)
  WHERE status = 'VALIDATED';

-- updated_at trigger (reuse function from migration 20261008000002)
CREATE TRIGGER trg_pdqe_extractions_updated_at
  BEFORE UPDATE ON pdqe.extractions
  FOR EACH ROW EXECUTE FUNCTION pdqe.set_updated_at();

-- ── 4. Transition helper: INGESTED → EXTRACTED ────────────────────────────────
-- Called by the Python extraction service after writing a VALIDATED extraction.
-- Writes a pipeline_state row via the standard state machine (migration 000003).

CREATE OR REPLACE FUNCTION pdqe.transition_to_extracted(
  p_source_id       UUID,
  p_extraction_id   UUID,
  p_model_id        TEXT,
  p_confidence      FLOAT DEFAULT NULL
)
RETURNS pdqe.pipeline_state
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_state TEXT;
  v_row           pdqe.pipeline_state;
BEGIN
  -- Read current lifecycle state
  SELECT lifecycle_state INTO v_current_state
  FROM pdqe.sources
  WHERE source_id = p_source_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source % not found', p_source_id;
  END IF;

  -- Only advance from INGESTED (or re-extraction from EXTRACTED / QUARANTINED)
  IF v_current_state NOT IN ('INGESTED', 'EXTRACTED', 'QUARANTINED') THEN
    RAISE EXCEPTION
      'Cannot transition to EXTRACTED from state %. Source: %',
      v_current_state, p_source_id;
  END IF;

  -- Write the state transition record
  INSERT INTO pdqe.pipeline_state (
    source_id,
    state_from,
    state_to,
    actor_type,
    actor_version,
    rationale,
    output_hash
  ) VALUES (
    p_source_id,
    v_current_state,
    'EXTRACTED',
    'CLAUDE',
    p_model_id,
    jsonb_build_object(
      'extraction_id', p_extraction_id,
      'confidence',    p_confidence
    )::text,
    p_extraction_id::text   -- extraction_id serves as a pointer to the output
  ) RETURNING * INTO v_row;

  -- Advance the source's lifecycle_state
  UPDATE pdqe.sources
  SET lifecycle_state = 'EXTRACTED',
      updated_at      = now()
  WHERE source_id = p_source_id;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION pdqe.transition_to_extracted IS
  'Advance a source from INGESTED → EXTRACTED after a successful Stage 03
   extraction. Writes a pipeline_state record (actor_type = CLAUDE) and
   updates pdqe.sources.lifecycle_state. Only permitted from INGESTED,
   EXTRACTED (re-extraction), or QUARANTINED (remediation). SECURITY DEFINER
   so the pipeline service can execute it as service_role.';

-- ── 5. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE pdqe.extractions ENABLE ROW LEVEL SECURITY;

-- pdqe_admin: full access
CREATE POLICY "pdqe_admin_all_extractions"
  ON pdqe.extractions
  FOR ALL
  TO pdqe_admin
  USING (true)
  WITH CHECK (true);

-- pdqe_reviewer: read-only (validates before Stage 05 / human review gate)
CREATE POLICY "pdqe_reviewer_read_extractions"
  ON pdqe.extractions
  FOR SELECT
  TO pdqe_reviewer
  USING (true);

-- service_role: full bypass (pipeline service writes via service role)
CREATE POLICY "service_role_all_extractions"
  ON pdqe.extractions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- pdqe_provider: no access — extraction internals are pipeline-only
-- (No policy → deny by default under RLS)

-- ── 6. Grants ─────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON pdqe.extractions TO pdqe_admin;
GRANT SELECT                          ON pdqe.extractions TO pdqe_reviewer;
GRANT ALL                             ON pdqe.extractions TO service_role;

GRANT EXECUTE ON FUNCTION pdqe.transition_to_extracted TO service_role, pdqe_admin;
