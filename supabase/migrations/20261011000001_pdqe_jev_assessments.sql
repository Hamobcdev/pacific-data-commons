-- ============================================================================
-- PDQE Stage 04 — Migration 1 of 1
-- pdqe.jev_assessments — Jev Qualification Results
--
-- Stores all Jev question results for each extraction's qualification run.
-- Append-only — UPDATE and DELETE blocked by RLS (same pattern as
-- pdqe.pipeline_state and pdqe.audit_log).
-- Versioned: question_set_version, threshold_config_version, jev_model_version.
--
-- Implements Stage 04 of the PDQE lifecycle:
--
--   EXTRACTED → (Stage 04) → CLASSIFIED → (Stage 04) → QUALIFIED
--
-- Both transitions happen within a single qualification run and are recorded
-- as two separate pdqe.pipeline_state rows (consistent with how Stage 03's
-- transition_to_extracted() writes to pipeline_state, not audit_log).
--
-- Reference: PDQE_MASTER_BUILD.md, stages/04-jev-qualification.md, P9
-- Depends on: 20261008000001_pdqe_schema_and_roles.sql
--             20261008000002_pdqe_sources.sql
--             20261008000003_pdqe_pipeline_state.sql
--             20261008000006_pdqe_extractions.sql
-- Author: Anthony Williams / Synergy Blockchain Pacific
-- Date: 2026-10-11
--
-- ADDITIVE ONLY — does not alter any existing PDQE or PDC tables
-- ============================================================================

BEGIN;

-- ── 1. Routing decision enumeration ──────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE pdqe.routing_decision AS ENUM (
    'AUTO_APPROVE',
    'HUMAN_REVIEW',
    'REJECT',
    'LICENCE_CHECK_REQUIRED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMENT ON TYPE pdqe.routing_decision IS
  'Deterministic routing outcome applied to a Jev assessment (Stage 04).
   Jev returns typed scores only — this enum is the output of threshold
   logic applied to those scores by deterministic code, never by Jev itself.';

-- ── 2. Domain classification enumeration ─────────────────────────────────────
-- Mirrors pdqe.source_domain (migration 20261008000002) plus NONE_OF_THE_ABOVE,
-- which is a valid Jev choice result that maps to OTHER at the DB boundary for
-- pdqe.sources.candidate_domains (which uses pdqe.source_domain, no NOTA value).

DO $$ BEGIN
  CREATE TYPE pdqe.domain_classification AS ENUM (
    'FISHERIES',
    'CLIMATE',
    'TRADE',
    'AGRICULTURE',
    'OCEAN',
    'ENVIRONMENT',
    'ECONOMICS',
    'GOVERNANCE',
    'HEALTH',
    'OTHER',
    'NONE_OF_THE_ABOVE'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 3. pdqe.jev_assessments table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pdqe.jev_assessments (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id               UUID NOT NULL REFERENCES pdqe.extractions(extraction_id) ON DELETE RESTRICT,
  source_id                   UUID NOT NULL REFERENCES pdqe.sources(source_id) ON DELETE RESTRICT,

  -- Versioning (all must be set — no nulls; reproducibility requirement)
  question_set_version        TEXT NOT NULL CHECK (char_length(question_set_version) > 0),
  threshold_config_version    TEXT NOT NULL CHECK (char_length(threshold_config_version) > 0),
  jev_model_version           TEXT NOT NULL CHECK (char_length(jev_model_version) > 0),
  mock_mode                   BOOLEAN NOT NULL DEFAULT FALSE,

  -- Noul questions (0.0-1.0 probability, each required)
  source_identifiable         NUMERIC(5,4) NOT NULL CHECK (source_identifiable BETWEEN 0 AND 1),
  publisher_identifiable      NUMERIC(5,4) NOT NULL CHECK (publisher_identifiable BETWEEN 0 AND 1),
  methodology_present         NUMERIC(5,4) NOT NULL CHECK (methodology_present BETWEEN 0 AND 1),
  licence_statement_present   NUMERIC(5,4) NOT NULL CHECK (licence_statement_present BETWEEN 0 AND 1),
  geography_identifiable      NUMERIC(5,4) NOT NULL CHECK (geography_identifiable BETWEEN 0 AND 1),
  time_period_identifiable    NUMERIC(5,4) NOT NULL CHECK (time_period_identifiable BETWEEN 0 AND 1),
  machine_readable            NUMERIC(5,4) NOT NULL CHECK (machine_readable BETWEEN 0 AND 1),
  value_plausible             NUMERIC(5,4) NOT NULL CHECK (value_plausible BETWEEN 0 AND 1),

  -- Score questions (0-4 ordered readiness scale)
  metadata_completeness       SMALLINT NOT NULL CHECK (metadata_completeness BETWEEN 0 AND 4),
  provenance_completeness     SMALLINT NOT NULL CHECK (provenance_completeness BETWEEN 0 AND 4),
  documentation_readiness     SMALLINT NOT NULL CHECK (documentation_readiness BETWEEN 0 AND 4),
  endpoint_readiness          SMALLINT NOT NULL CHECK (endpoint_readiness BETWEEN 0 AND 4),

  -- Derived completeness score (0-4) — computed by deterministic code, not Jev
  completeness_score          SMALLINT NOT NULL CHECK (completeness_score BETWEEN 0 AND 4),

  -- Choice question
  domain_classification       pdqe.domain_classification NOT NULL,
  classification_confidence   NUMERIC(5,4) NOT NULL CHECK (classification_confidence BETWEEN 0 AND 1),

  -- Routing output (deterministic code applies thresholds to Jev scores)
  routing_decision            pdqe.routing_decision NOT NULL,
  routing_rationale           TEXT NOT NULL CHECK (char_length(routing_rationale) > 0),
  auto_approve                BOOLEAN NOT NULL GENERATED ALWAYS AS (routing_decision = 'AUTO_APPROVE') STORED,
  requires_human_review       BOOLEAN NOT NULL GENERATED ALWAYS AS (routing_decision = 'HUMAN_REVIEW') STORED,
  requires_licence_check      BOOLEAN NOT NULL GENERATED ALWAYS AS (routing_decision = 'LICENCE_CHECK_REQUIRED') STORED,

  -- Audit
  assessed_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  assessed_by                 TEXT NOT NULL DEFAULT 'pdqe_pipeline',  -- 'pdqe_pipeline' or auth.uid()::text

  CONSTRAINT jev_assessments_one_per_extraction UNIQUE (extraction_id)
);

COMMENT ON TABLE pdqe.jev_assessments IS
  'Jev (TypeSafe AI) qualification results for each PDQE extraction. Append-only. '
  'Routing decisions are applied by deterministic code using configurable thresholds — '
  'Jev only returns typed scores; it does not decide routing itself.';

COMMENT ON COLUMN pdqe.jev_assessments.completeness_score IS
  'Derived by deterministic code from metadata_completeness at write time — '
  'not an independent Jev question. Mirrors the proxy used by compute_routing().';

-- ── 4. State transition functions for Stage 04 ───────────────────────────────
-- Mirrors the Stage 03 pattern (pdqe.transition_to_extracted, migration
-- 20261008000006): a bespoke SECURITY DEFINER function per stage transition
-- that validates current state, writes a pdqe.pipeline_state row (NOT
-- pdqe.audit_log — that table has no state_from/state_to columns), and
-- advances pdqe.sources.lifecycle_state. Both transitions are already present
-- in pdqe.permitted_transitions (migration 20261008000003).

CREATE OR REPLACE FUNCTION pdqe.transition_to_classified(
  p_source_id       UUID,
  p_extraction_id   UUID DEFAULT NULL
)
RETURNS pdqe.pipeline_state
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_state TEXT;
  v_row           pdqe.pipeline_state;
BEGIN
  SELECT lifecycle_state INTO v_current_state
    FROM pdqe.sources
   WHERE source_id = p_source_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE source not found: %', p_source_id;
  END IF;

  IF v_current_state != 'EXTRACTED' THEN
    RAISE EXCEPTION
      'Cannot transition source % to CLASSIFIED: current state is % (expected EXTRACTED)',
      p_source_id, v_current_state;
  END IF;

  INSERT INTO pdqe.pipeline_state (
    source_id, state_from, state_to,
    actor_type, actor_version, rationale, output_hash
  ) VALUES (
    p_source_id, 'EXTRACTED', 'CLASSIFIED',
    'DETERMINISTIC', 'pdqe-stage04-v0.4.0',
    'Domain classification complete.', p_extraction_id::text
  ) RETURNING * INTO v_row;

  UPDATE pdqe.sources
     SET lifecycle_state = 'CLASSIFIED',
         updated_at      = now()
   WHERE source_id = p_source_id;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION pdqe.transition_to_classified IS
  'Advance a source from EXTRACTED -> CLASSIFIED as the first half of a Stage 04
   qualification run. Writes a pipeline_state record (actor_type = DETERMINISTIC).
   SECURITY DEFINER so the pipeline service can execute it as service_role.';

CREATE OR REPLACE FUNCTION pdqe.transition_to_qualified(
  p_source_id         UUID,
  p_routing_decision  TEXT,
  p_assessment_id     UUID DEFAULT NULL
)
RETURNS pdqe.pipeline_state
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_state TEXT;
  v_row           pdqe.pipeline_state;
BEGIN
  SELECT lifecycle_state INTO v_current_state
    FROM pdqe.sources
   WHERE source_id = p_source_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE source not found: %', p_source_id;
  END IF;

  IF v_current_state != 'CLASSIFIED' THEN
    RAISE EXCEPTION
      'Cannot transition source % to QUALIFIED: current state is % (expected CLASSIFIED)',
      p_source_id, v_current_state;
  END IF;

  INSERT INTO pdqe.pipeline_state (
    source_id, state_from, state_to,
    actor_type, actor_version, rationale, output_hash
  ) VALUES (
    p_source_id, 'CLASSIFIED', 'QUALIFIED',
    'JEV', 'pdqe-stage04-v0.4.0',
    'Jev qualification complete. Routing: ' || p_routing_decision,
    p_assessment_id::text
  ) RETURNING * INTO v_row;

  UPDATE pdqe.sources
     SET lifecycle_state = 'QUALIFIED',
         updated_at      = now()
   WHERE source_id = p_source_id;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION pdqe.transition_to_qualified IS
  'Advance a source from CLASSIFIED -> QUALIFIED as the second half of a Stage 04
   qualification run. Writes a pipeline_state record (actor_type = JEV) carrying
   the routing decision in its rationale. SECURITY DEFINER so the pipeline
   service can execute it as service_role.';

-- ── 5. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_jev_assessments_source_id ON pdqe.jev_assessments (source_id);
CREATE INDEX IF NOT EXISTS idx_jev_assessments_routing ON pdqe.jev_assessments (routing_decision);
CREATE INDEX IF NOT EXISTS idx_jev_assessments_domain ON pdqe.jev_assessments (domain_classification);
CREATE INDEX IF NOT EXISTS idx_jev_assessments_completeness ON pdqe.jev_assessments (completeness_score);

-- ── 6. Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE pdqe.jev_assessments ENABLE ROW LEVEL SECURITY;

-- pdqe_admin: full read; no UPDATE/DELETE (append-only enforcement)
CREATE POLICY "pdqe_admin_read_jev_assessments"
  ON pdqe.jev_assessments FOR SELECT
  TO pdqe_admin USING (true);

CREATE POLICY "pdqe_admin_insert_jev_assessments"
  ON pdqe.jev_assessments FOR INSERT
  TO pdqe_admin WITH CHECK (true);

-- pdqe_reviewer: read only
CREATE POLICY "pdqe_reviewer_read_jev_assessments"
  ON pdqe.jev_assessments FOR SELECT
  TO pdqe_reviewer USING (true);

-- service_role: full access (pipeline writes via service key)
CREATE POLICY "service_role_all_jev_assessments"
  ON pdqe.jev_assessments FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- No UPDATE or DELETE policy for any role — append-only enforced by omission,
-- same belt-and-suspenders pattern as pdqe.pipeline_state and pdqe.audit_log.

-- ── 7. Grants ─────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT ON pdqe.jev_assessments TO pdqe_admin;
GRANT SELECT ON pdqe.jev_assessments TO pdqe_reviewer;
GRANT ALL ON pdqe.jev_assessments TO service_role;

GRANT EXECUTE ON FUNCTION pdqe.transition_to_classified TO service_role, pdqe_admin;
GRANT EXECUTE ON FUNCTION pdqe.transition_to_qualified TO service_role, pdqe_admin;

-- Explicitly deny UPDATE and DELETE for all roles except service_role
-- (service_role should never UPDATE/DELETE in practice — append-only by convention)
REVOKE UPDATE, DELETE ON pdqe.jev_assessments FROM pdqe_admin, pdqe_reviewer, pdqe_provider, pdqe_reader;

COMMIT;
