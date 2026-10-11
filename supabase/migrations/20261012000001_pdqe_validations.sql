-- ============================================================================
-- PDQE Stage 05 — Migration 1 of 1
-- pdqe.validations — Deterministic Validation Results
--
-- Records every deterministic validator result for each source's Stage 05
-- validation run. Append-only — UPDATE and DELETE blocked by RLS (same
-- pattern as pdqe.pipeline_state, pdqe.audit_log, pdqe.jev_assessments).
--
-- Implements Stage 05 of the PDQE lifecycle:
--
--   QUALIFIED → (Stage 05) → VALIDATED   (AUTO_APPROVE + all validators pass)
--   QUALIFIED → (Stage 05) → REVIEW      (HUMAN_REVIEW / LICENCE_CHECK_REQUIRED,
--                                         or AUTO_APPROVE downgraded by a
--                                         validator failure)
--   QUALIFIED → (Stage 05) → REJECTED    (Stage 04 REJECT, or EXCLUDED licence)
--
-- Outcome is set by deterministic code only — never by a model.
--
-- Reference: PDQE_MASTER_BUILD.md, Stage 05, P9
-- Depends on: 20261008000002_pdqe_sources.sql
--             20261008000003_pdqe_pipeline_state.sql
--             20261011000001_pdqe_jev_assessments.sql
-- Author: Anthony Williams / Synergy Blockchain Pacific
-- Date: 2026-10-12
--
-- ADDITIVE ONLY — does not alter any existing PDQE or PDC tables. The only
-- write to existing data is one new row in pdqe.permitted_transitions
-- (QUALIFIED → REVIEW), see §1.
-- ============================================================================

BEGIN;

-- ── 1. Permitted transition: QUALIFIED → REVIEW ──────────────────────────────
-- The Stage 01 allowlist (migration 20261008000003) seeds QUALIFIED → VALIDATED
-- and QUALIFIED → REJECTED, and VALIDATED → REVIEW, but not QUALIFIED → REVIEW.
-- Stage 05 sends HUMAN_REVIEW / LICENCE_CHECK_REQUIRED / downgraded sources
-- straight to REVIEW without passing through VALIDATED (VALIDATED means every
-- validator passed on the auto-approve path — a source with failing validators
-- must never carry that state, even transiently). Added here so the allowlist
-- stays the complete record of what the lifecycle permits.

INSERT INTO pdqe.permitted_transitions (state_from, state_to)
VALUES ('QUALIFIED', 'REVIEW')
ON CONFLICT (state_from, state_to) DO NOTHING;

-- ── 2. Validation outcome enumeration ────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE pdqe.validation_outcome AS ENUM (
    'VALIDATED',
    'REVIEW',
    'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMENT ON TYPE pdqe.validation_outcome IS
  'Deterministic Stage 05 outcome. Set by code from the Stage 04 routing
   decision plus deterministic validator results — never by a model.';

-- ── 3. pdqe.validations table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pdqe.validations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id                   UUID NOT NULL REFERENCES pdqe.sources(source_id) ON DELETE RESTRICT,
  assessment_id               UUID NOT NULL REFERENCES pdqe.jev_assessments(id) ON DELETE RESTRICT,

  -- Versioning (reproducibility requirement)
  validator_version           TEXT NOT NULL CHECK (char_length(validator_version) > 0),

  -- Individual validator results: JSONB array of {validator_id, passed, reason}
  validator_results           JSONB NOT NULL DEFAULT '[]'::jsonb
                              CHECK (jsonb_typeof(validator_results) = 'array'),

  -- Counts
  validators_run              SMALLINT NOT NULL CHECK (validators_run >= 0),
  validators_passed           SMALLINT NOT NULL CHECK (validators_passed >= 0),
  validators_failed           SMALLINT NOT NULL CHECK (validators_failed >= 0),

  -- Final outcome (deterministic — never set by model)
  outcome                     pdqe.validation_outcome NOT NULL,
  outcome_reason              TEXT NOT NULL CHECK (char_length(outcome_reason) > 0),

  -- Routing decision from Stage 04 (carried forward for traceability)
  stage04_routing_decision    pdqe.routing_decision NOT NULL,

  -- Whether this went to the human review queue
  queued_for_review           BOOLEAN NOT NULL DEFAULT FALSE,
  review_queue_id             UUID,  -- FK to pdqe.human_reviews once Stage 06 exists

  -- Audit
  validated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_by                TEXT NOT NULL DEFAULT 'pdqe_pipeline',

  CONSTRAINT validations_one_per_assessment UNIQUE (assessment_id),
  CONSTRAINT validations_counts_consistent
    CHECK (validators_run = validators_passed + validators_failed),
  CONSTRAINT validations_queue_matches_outcome
    CHECK (queued_for_review = (outcome = 'REVIEW'))
);

COMMENT ON TABLE pdqe.validations IS
  'Stage 05 deterministic validation results. Every validator decision recorded. '
  'Outcome is set by code, never by a model. A failed validator on the AUTO_APPROVE path '
  'downgrades to REVIEW — never silently passes. Append-only.';

COMMENT ON COLUMN pdqe.validations.review_queue_id IS
  'Reserved for the Stage 06 human review queue row. FK constraint added when '
  'pdqe.human_reviews exists.';

-- ── 4. State transition functions for Stage 05 ───────────────────────────────
-- Same pattern as Stage 03/04 (transition_to_extracted / _classified /
-- _qualified): a SECURITY DEFINER function per transition that locks the
-- source row, validates current state, appends a pdqe.pipeline_state row
-- (actor_type = DETERMINISTIC), and advances pdqe.sources.lifecycle_state.
-- p_validation_id is recorded as output_hash so every pipeline_state row
-- points at the pdqe.validations row that justified it.

CREATE OR REPLACE FUNCTION pdqe.transition_to_validated(
  p_source_id       UUID,
  p_validation_id   UUID DEFAULT NULL
)
RETURNS pdqe.pipeline_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdqe, pg_temp
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

  IF v_current_state != 'QUALIFIED' THEN
    RAISE EXCEPTION
      'Cannot transition source % to VALIDATED: current state is % (expected QUALIFIED)',
      p_source_id, v_current_state;
  END IF;

  INSERT INTO pdqe.pipeline_state (
    source_id, state_from, state_to,
    actor_type, actor_version, rationale, output_hash
  ) VALUES (
    p_source_id, 'QUALIFIED', 'VALIDATED',
    'DETERMINISTIC', 'pdqe-stage05-v0.5.0',
    'All deterministic validators passed on AUTO_APPROVE path.',
    p_validation_id::text
  ) RETURNING * INTO v_row;

  UPDATE pdqe.sources
     SET lifecycle_state = 'VALIDATED',
         updated_at      = now()
   WHERE source_id = p_source_id;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION pdqe.transition_to_validated IS
  'Advance a source QUALIFIED -> VALIDATED (Stage 05, AUTO_APPROVE path with
   every validator passing). Writes a pipeline_state record (actor_type =
   DETERMINISTIC). SECURITY DEFINER; EXECUTE granted to service_role and
   pdqe_admin only.';

CREATE OR REPLACE FUNCTION pdqe.transition_to_review(
  p_source_id       UUID,
  p_reason          TEXT,
  p_validation_id   UUID DEFAULT NULL
)
RETURNS pdqe.pipeline_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdqe, pg_temp
AS $$
DECLARE
  v_current_state TEXT;
  v_row           pdqe.pipeline_state;
BEGIN
  IF p_reason IS NULL OR char_length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'transition_to_review requires a non-empty reason (source %)', p_source_id;
  END IF;

  SELECT lifecycle_state INTO v_current_state
    FROM pdqe.sources
   WHERE source_id = p_source_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE source not found: %', p_source_id;
  END IF;

  IF v_current_state != 'QUALIFIED' THEN
    RAISE EXCEPTION
      'Cannot transition source % to REVIEW: current state is % (expected QUALIFIED)',
      p_source_id, v_current_state;
  END IF;

  INSERT INTO pdqe.pipeline_state (
    source_id, state_from, state_to,
    actor_type, actor_version, rationale, output_hash
  ) VALUES (
    p_source_id, 'QUALIFIED', 'REVIEW',
    'DETERMINISTIC', 'pdqe-stage05-v0.5.0',
    p_reason,
    p_validation_id::text
  ) RETURNING * INTO v_row;

  UPDATE pdqe.sources
     SET lifecycle_state = 'REVIEW',
         updated_at      = now()
   WHERE source_id = p_source_id;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION pdqe.transition_to_review IS
  'Advance a source QUALIFIED -> REVIEW (Stage 05: HUMAN_REVIEW,
   LICENCE_CHECK_REQUIRED, or AUTO_APPROVE downgraded by a validator failure).
   Reason is recorded verbatim as the pipeline_state rationale.';

CREATE OR REPLACE FUNCTION pdqe.transition_to_rejected(
  p_source_id       UUID,
  p_reason          TEXT,
  p_validation_id   UUID DEFAULT NULL
)
RETURNS pdqe.pipeline_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdqe, pg_temp
AS $$
DECLARE
  v_current_state TEXT;
  v_row           pdqe.pipeline_state;
BEGIN
  IF p_reason IS NULL OR char_length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'transition_to_rejected requires a non-empty reason (source %)', p_source_id;
  END IF;

  SELECT lifecycle_state INTO v_current_state
    FROM pdqe.sources
   WHERE source_id = p_source_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE source not found: %', p_source_id;
  END IF;

  IF v_current_state != 'QUALIFIED' THEN
    RAISE EXCEPTION
      'Cannot transition source % to REJECTED: current state is % (expected QUALIFIED)',
      p_source_id, v_current_state;
  END IF;

  INSERT INTO pdqe.pipeline_state (
    source_id, state_from, state_to,
    actor_type, actor_version, rationale, output_hash
  ) VALUES (
    p_source_id, 'QUALIFIED', 'REJECTED',
    'DETERMINISTIC', 'pdqe-stage05-v0.5.0',
    p_reason,
    p_validation_id::text
  ) RETURNING * INTO v_row;

  UPDATE pdqe.sources
     SET lifecycle_state = 'REJECTED',
         updated_at      = now()
   WHERE source_id = p_source_id;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION pdqe.transition_to_rejected IS
  'Advance a source QUALIFIED -> REJECTED (Stage 05: Stage 04 REJECT routing,
   or EXCLUDED licence). Reason is recorded verbatim as the pipeline_state
   rationale. Scoped to QUALIFIED only — REJECTED from other states is not
   this function''s job.';

-- ── 5. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_validations_source_id ON pdqe.validations (source_id);
CREATE INDEX IF NOT EXISTS idx_validations_outcome ON pdqe.validations (outcome);
CREATE INDEX IF NOT EXISTS idx_validations_queued
  ON pdqe.validations (queued_for_review) WHERE queued_for_review = TRUE;

-- ── 6. Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE pdqe.validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdqe_admin_read_validations"
  ON pdqe.validations FOR SELECT
  TO pdqe_admin USING (true);

CREATE POLICY "pdqe_admin_insert_validations"
  ON pdqe.validations FOR INSERT
  TO pdqe_admin WITH CHECK (true);

CREATE POLICY "pdqe_reviewer_read_validations"
  ON pdqe.validations FOR SELECT
  TO pdqe_reviewer USING (true);

CREATE POLICY "service_role_all_validations"
  ON pdqe.validations FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- No UPDATE or DELETE policy for any role — append-only enforced by omission.

-- ── 7. Grants ─────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT ON pdqe.validations TO pdqe_admin;
GRANT SELECT ON pdqe.validations TO pdqe_reviewer;
GRANT ALL ON pdqe.validations TO service_role;

REVOKE UPDATE, DELETE ON pdqe.validations FROM pdqe_admin, pdqe_reviewer, pdqe_provider, pdqe_reader;

-- Postgres grants EXECUTE on new functions to PUBLIC by default. These are
-- SECURITY DEFINER state-machine writers — strip PUBLIC/anon/authenticated
-- before granting to the pipeline roles.
REVOKE ALL ON FUNCTION pdqe.transition_to_validated(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.transition_to_review(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.transition_to_rejected(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION pdqe.transition_to_validated(UUID, UUID) TO service_role, pdqe_admin;
GRANT EXECUTE ON FUNCTION pdqe.transition_to_review(UUID, TEXT, UUID) TO service_role, pdqe_admin;
GRANT EXECUTE ON FUNCTION pdqe.transition_to_rejected(UUID, TEXT, UUID) TO service_role, pdqe_admin;

COMMIT;
