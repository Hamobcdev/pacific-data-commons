-- ============================================================================
-- PDQE Stage 06 — Migration 1 of 1
-- pdqe.human_reviews — Human Review Queue
--
-- AI performs bulk work. Humans handle consequential exceptions. Never hide
-- uncertainty to increase automation.
--
-- Sources that Stage 05 routed to REVIEW are queued here with the full
-- evidence the reviewer needs (Jev scores, validator results, routing
-- decision, provenance summary). A reviewer makes an explicit, reasoned
-- decision, recorded atomically with the lifecycle transition:
--
--   REVIEW → (Stage 06) → APPROVED   (pdqe.transition_to_approved)
--   REVIEW → (Stage 06) → REJECTED   (pdqe.transition_to_rejected_by_reviewer)
--
-- Reference: PDQE_MASTER_BUILD.md, Stage 06, P9
-- Depends on: 20261008000002_pdqe_sources.sql
--             20261008000003_pdqe_pipeline_state.sql
--             20261008000004_pdqe_audit_log.sql
--             20261011000001_pdqe_jev_assessments.sql
--             20261012000001_pdqe_validations.sql
-- Author: Anthony Williams / Synergy Blockchain Pacific
-- Date: 2026-10-12
--
-- ADDITIVE except §9 (security follow-up), which only REVOKEs EXECUTE from
-- PUBLIC/anon/authenticated on existing functions and re-GRANTs it to the
-- roles that already hold it. No data in existing tables is modified.
-- ============================================================================

BEGIN;

-- ── 1. Permitted transitions: REVIEW → APPROVED, REVIEW → REJECTED ───────────
-- Both are already seeded by 20261008000003 (confirmed against the live DB
-- before writing this migration). Kept as idempotent no-ops so the allowlist
-- requirement for Stage 06 is explicit in this file.

INSERT INTO pdqe.permitted_transitions (state_from, state_to)
VALUES ('REVIEW', 'APPROVED'), ('REVIEW', 'REJECTED')
ON CONFLICT (state_from, state_to) DO NOTHING;

-- ── 2. Enumerations ───────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE pdqe.review_type AS ENUM (
    'LICENSE_REVIEW',         -- licence unclear or UNKNOWN
    'CLASSIFICATION_REVIEW',  -- domain classification uncertain
    'SENSITIVITY_REVIEW',     -- potential sensitivity concern flagged by a validator
    'ENRICHMENT_REVIEW',      -- data needs additional context before approval
    'ENDPOINT_REVIEW',        -- endpoint specification needs human check
    'PROVIDER_APPROVAL'       -- provider-submitted data requiring explicit sign-off
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMENT ON TYPE pdqe.review_type IS
  'Stage 06 review type. Inferred deterministically from the Stage 04 routing
   decision and Stage 05 validator results — never by a model.';

DO $$ BEGIN
  CREATE TYPE pdqe.review_decision AS ENUM (
    'APPROVED',
    'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMENT ON TYPE pdqe.review_decision IS
  'Explicit human reviewer decision. NULL on pdqe.human_reviews means pending.';

-- ── 3. pdqe.human_reviews table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pdqe.human_reviews (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id                   UUID NOT NULL REFERENCES pdqe.sources(source_id) ON DELETE RESTRICT,
  validation_id               UUID NOT NULL REFERENCES pdqe.validations(id) ON DELETE RESTRICT,

  review_type                 pdqe.review_type NOT NULL,

  -- Evidence shown to the reviewer. Never NULL, never empty — a reviewer must
  -- always see what the pipeline decided and why.
  review_context              JSONB NOT NULL
                              CHECK (jsonb_typeof(review_context) = 'object'
                                     AND review_context <> '{}'::jsonb),

  -- Decision (NULL until reviewed). reviewer_id is the auth.users id of the
  -- human who decided — same FK as pipeline_state.actor_user_id.
  reviewer_id                 UUID REFERENCES auth.users(id),
  decision                    pdqe.review_decision,
  decision_reason             TEXT,

  -- Stage 04 routing decision, carried forward for traceability.
  previous_routing_decision   pdqe.routing_decision NOT NULL,

  queued_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at                 TIMESTAMPTZ,

  -- One review per Stage 05 validation run.
  CONSTRAINT human_reviews_one_per_validation UNIQUE (validation_id),

  -- A decision always carries a non-blank reason.
  CONSTRAINT human_reviews_reason_required
    CHECK (decision IS NULL OR char_length(trim(decision_reason)) > 0),

  -- A decision always records who and when; a pending review records neither.
  CONSTRAINT human_reviews_decision_fields_consistent
    CHECK (
      (decision IS NULL AND reviewer_id IS NULL AND reviewed_at IS NULL AND decision_reason IS NULL)
      OR
      (decision IS NOT NULL AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)
    )
);

COMMENT ON TABLE pdqe.human_reviews IS
  'Stage 06 human review queue. One row per Stage 05 REVIEW outcome. Queue
   metadata is immutable; the decision fields are write-once and are set only
   by pdqe.transition_to_approved / pdqe.transition_to_rejected_by_reviewer,
   atomically with the lifecycle transition. No DELETE for any role.';

COMMENT ON COLUMN pdqe.human_reviews.review_context IS
  'Full evidence shown to the reviewer (Jev scores, validator results, routing
   decision, provenance summary). P9: data, never instructions.';

-- At most one pending review per source.
CREATE UNIQUE INDEX IF NOT EXISTS idx_human_reviews_one_pending_per_source
  ON pdqe.human_reviews (source_id) WHERE decision IS NULL;

CREATE INDEX IF NOT EXISTS idx_human_reviews_pending_queued_at
  ON pdqe.human_reviews (queued_at DESC) WHERE decision IS NULL;

CREATE INDEX IF NOT EXISTS idx_human_reviews_source_id
  ON pdqe.human_reviews (source_id);

-- ── 4. Integrity triggers ─────────────────────────────────────────────────────

-- 4a. INSERT: a review can only be queued for a source that is currently in
-- REVIEW, against a validation of that same source whose outcome was REVIEW,
-- and never with decision fields pre-filled.
CREATE OR REPLACE FUNCTION pdqe.check_human_review_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pdqe, pg_temp
AS $$
DECLARE
  v_state     TEXT;
  v_val_src   UUID;
  v_outcome   pdqe.validation_outcome;
BEGIN
  IF NEW.decision IS NOT NULL OR NEW.reviewer_id IS NOT NULL
     OR NEW.reviewed_at IS NOT NULL OR NEW.decision_reason IS NOT NULL THEN
    RAISE EXCEPTION 'pdqe.human_reviews: decision fields must be NULL when a review is queued';
  END IF;

  SELECT lifecycle_state INTO v_state FROM pdqe.sources WHERE source_id = NEW.source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pdqe.human_reviews: source % not found', NEW.source_id;
  END IF;
  IF v_state != 'REVIEW' THEN
    RAISE EXCEPTION 'pdqe.human_reviews: source % is in state % (expected REVIEW)',
      NEW.source_id, v_state;
  END IF;

  SELECT source_id, outcome INTO v_val_src, v_outcome
    FROM pdqe.validations WHERE id = NEW.validation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pdqe.human_reviews: validation % not found', NEW.validation_id;
  END IF;
  IF v_val_src != NEW.source_id THEN
    RAISE EXCEPTION 'pdqe.human_reviews: validation % does not belong to source %',
      NEW.validation_id, NEW.source_id;
  END IF;
  IF v_outcome != 'REVIEW' THEN
    RAISE EXCEPTION 'pdqe.human_reviews: validation % has outcome % (expected REVIEW)',
      NEW.validation_id, v_outcome;
  END IF;

  NEW.queued_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pdqe_human_reviews_check_insert
  BEFORE INSERT ON pdqe.human_reviews
  FOR EACH ROW EXECUTE FUNCTION pdqe.check_human_review_insert();

-- 4b. UPDATE: queue metadata is immutable; the decision is write-once and may
-- only be written from inside the Stage 06 transition functions (they set a
-- transaction-local flag), so a decision can never land without its
-- lifecycle transition. DELETE is never permitted.
CREATE OR REPLACE FUNCTION pdqe.guard_human_review_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pdqe, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pdqe.human_reviews: DELETE is not permitted (review %)', OLD.id;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.validation_id IS DISTINCT FROM OLD.validation_id
     OR NEW.review_type IS DISTINCT FROM OLD.review_type
     OR NEW.review_context IS DISTINCT FROM OLD.review_context
     OR NEW.previous_routing_decision IS DISTINCT FROM OLD.previous_routing_decision
     OR NEW.queued_at IS DISTINCT FROM OLD.queued_at THEN
    RAISE EXCEPTION 'pdqe.human_reviews: queue metadata is immutable (review %)', OLD.id;
  END IF;

  IF OLD.decision IS NOT NULL THEN
    RAISE EXCEPTION 'pdqe.human_reviews: review % already decided (%) — decisions are write-once',
      OLD.id, OLD.decision;
  END IF;

  IF coalesce(current_setting('pdqe.stage06_decision', true), '') != 'on' THEN
    RAISE EXCEPTION 'pdqe.human_reviews: decisions must be recorded via '
      'pdqe.transition_to_approved / pdqe.transition_to_rejected_by_reviewer (review %)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pdqe_human_reviews_guard_mutation
  BEFORE UPDATE OR DELETE ON pdqe.human_reviews
  FOR EACH ROW EXECUTE FUNCTION pdqe.guard_human_review_mutation();

-- 4c. AFTER INSERT: audit the queueing event.
CREATE OR REPLACE FUNCTION pdqe.audit_human_review_queued()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdqe, pg_temp
AS $$
BEGIN
  PERFORM pdqe.log_event(
    p_event_type    => 'HUMAN_REVIEW_QUEUED',
    p_source_id     => NEW.source_id,
    p_actor_type    => 'DETERMINISTIC',
    p_actor_version => 'pdqe-stage06-v0.6.0',
    p_details       => jsonb_build_object(
                         'review_id', NEW.id,
                         'validation_id', NEW.validation_id,
                         'review_type', NEW.review_type,
                         'previous_routing_decision', NEW.previous_routing_decision)
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_pdqe_human_reviews_audit_queued
  AFTER INSERT ON pdqe.human_reviews
  FOR EACH ROW EXECUTE FUNCTION pdqe.audit_human_review_queued();

-- ── 5. Shared decision writer (internal) ──────────────────────────────────────
-- Not callable by any client role (EXECUTE revoked in §8). The two public
-- transition functions below are thin wrappers so the REVIEW → APPROVED and
-- REVIEW → REJECTED paths cannot drift apart.

CREATE OR REPLACE FUNCTION pdqe.record_review_decision(
  p_source_id     UUID,
  p_review_id     UUID,
  p_reason        TEXT,
  p_reviewer_id   UUID,
  p_decision      pdqe.review_decision
)
RETURNS pdqe.pipeline_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdqe, pg_temp
AS $$
DECLARE
  v_review_source   UUID;
  v_review_decision pdqe.review_decision;
  v_current_state   TEXT;
  v_licence         pdqe.licence_status;
  v_target          TEXT := p_decision::text;
  v_row             pdqe.pipeline_state;
BEGIN
  IF p_reason IS NULL OR char_length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Stage 06 decision requires a non-empty reason (review %)', p_review_id;
  END IF;
  IF p_reviewer_id IS NULL THEN
    RAISE EXCEPTION 'Stage 06 decision requires a reviewer id (review %)', p_review_id;
  END IF;

  -- Lock the review row first: two concurrent decisions on the same review
  -- serialise here and the second sees the first's decision.
  SELECT source_id, decision INTO v_review_source, v_review_decision
    FROM pdqe.human_reviews
   WHERE id = p_review_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE human review not found: %', p_review_id;
  END IF;
  IF v_review_source != p_source_id THEN
    RAISE EXCEPTION 'Review % does not belong to source %', p_review_id, p_source_id;
  END IF;
  IF v_review_decision IS NOT NULL THEN
    RAISE EXCEPTION 'Review % already decided: %', p_review_id, v_review_decision;
  END IF;

  SELECT lifecycle_state, licence_status INTO v_current_state, v_licence
    FROM pdqe.sources
   WHERE source_id = p_source_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE source not found: %', p_source_id;
  END IF;
  IF v_current_state != 'REVIEW' THEN
    RAISE EXCEPTION
      'Cannot transition source % to %: current state is % (expected REVIEW)',
      p_source_id, v_target, v_current_state;
  END IF;

  -- "Unknown is not approval." A reviewer resolves a licence question by
  -- recording the licence on pdqe.sources first; approval is blocked until
  -- they have. EXCLUDED is permanent and can never be approved.
  IF p_decision = 'APPROVED' AND v_licence IN ('UNKNOWN', 'EXCLUDED') THEN
    RAISE EXCEPTION
      'Cannot approve source %: licence_status is %. Record the confirmed licence on '
      'pdqe.sources before approving (UNKNOWN is not approval; EXCLUDED is permanent).',
      p_source_id, v_licence;
  END IF;

  INSERT INTO pdqe.pipeline_state (
    source_id, state_from, state_to,
    actor_type, actor_version, actor_user_id, rationale, output_hash
  ) VALUES (
    p_source_id, 'REVIEW', v_target,
    'HUMAN', 'pdqe-stage06-v0.6.0', p_reviewer_id, p_reason,
    p_review_id::text
  ) RETURNING * INTO v_row;

  UPDATE pdqe.sources
     SET lifecycle_state = v_target,
         updated_at      = now()
   WHERE source_id = p_source_id;

  -- Transaction-local: lets the guard trigger accept this one decision write.
  PERFORM set_config('pdqe.stage06_decision', 'on', true);

  UPDATE pdqe.human_reviews
     SET decision        = p_decision,
         decision_reason = p_reason,
         reviewer_id     = p_reviewer_id,
         reviewed_at     = now()
   WHERE id = p_review_id;

  PERFORM set_config('pdqe.stage06_decision', 'off', true);

  PERFORM pdqe.log_event(
    p_event_type        => CASE p_decision
                             WHEN 'APPROVED' THEN 'HUMAN_REVIEW_APPROVED'::pdqe.audit_event_type
                             ELSE 'HUMAN_REVIEW_REJECTED'::pdqe.audit_event_type
                           END,
    p_source_id         => p_source_id,
    p_pipeline_state_id => v_row.state_id,
    p_actor_type        => 'HUMAN',
    p_actor_version     => 'pdqe-stage06-v0.6.0',
    p_actor_user_id     => p_reviewer_id,
    p_details           => jsonb_build_object('review_id', p_review_id, 'rationale', p_reason)
  );

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION pdqe.record_review_decision IS
  'Internal Stage 06 decision writer. Not callable by client roles — use
   pdqe.transition_to_approved / pdqe.transition_to_rejected_by_reviewer.';

-- ── 6. Public transition functions ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pdqe.transition_to_approved(
  p_source_id     UUID,
  p_review_id     UUID,
  p_reason        TEXT,
  p_reviewer_id   UUID
)
RETURNS pdqe.pipeline_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdqe, pg_temp
AS $$
BEGIN
  RETURN pdqe.record_review_decision(p_source_id, p_review_id, p_reason, p_reviewer_id, 'APPROVED');
END;
$$;

COMMENT ON FUNCTION pdqe.transition_to_approved IS
  'Advance a source REVIEW -> APPROVED on an explicit human decision (Stage 06).
   Records the decision on pdqe.human_reviews, appends pipeline_state
   (actor_type = HUMAN, actor_user_id = reviewer), and audits it, atomically.
   Blocked while licence_status is UNKNOWN or EXCLUDED. SECURITY DEFINER;
   EXECUTE granted to service_role and pdqe_admin only.';

CREATE OR REPLACE FUNCTION pdqe.transition_to_rejected_by_reviewer(
  p_source_id     UUID,
  p_review_id     UUID,
  p_reason        TEXT,
  p_reviewer_id   UUID
)
RETURNS pdqe.pipeline_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pdqe, pg_temp
AS $$
BEGIN
  RETURN pdqe.record_review_decision(p_source_id, p_review_id, p_reason, p_reviewer_id, 'REJECTED');
END;
$$;

COMMENT ON FUNCTION pdqe.transition_to_rejected_by_reviewer IS
  'Advance a source REVIEW -> REJECTED on an explicit human decision (Stage 06).
   Same atomic recording as transition_to_approved. SECURITY DEFINER; EXECUTE
   granted to service_role and pdqe_admin only.';

-- ── 7. Row Level Security ──────────────────────────────────────────────────────
-- Decisions are written only through the transition functions above (which
-- run SECURITY DEFINER), so no client role is granted UPDATE: a direct UPDATE
-- would record a decision without its lifecycle transition. No DELETE for
-- anyone (RLS by omission + guard trigger for service_role, which bypasses RLS).

ALTER TABLE pdqe.human_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdqe_admin_read_human_reviews"
  ON pdqe.human_reviews FOR SELECT
  TO pdqe_admin USING (true);

CREATE POLICY "pdqe_admin_insert_human_reviews"
  ON pdqe.human_reviews FOR INSERT
  TO pdqe_admin WITH CHECK (true);

CREATE POLICY "pdqe_reviewer_read_human_reviews"
  ON pdqe.human_reviews FOR SELECT
  TO pdqe_reviewer USING (true);

CREATE POLICY "service_role_all_human_reviews"
  ON pdqe.human_reviews FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ── 8. Grants ─────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT ON pdqe.human_reviews TO pdqe_admin;
GRANT SELECT ON pdqe.human_reviews TO pdqe_reviewer;
GRANT ALL ON pdqe.human_reviews TO service_role;

REVOKE UPDATE, DELETE ON pdqe.human_reviews FROM pdqe_admin, pdqe_reviewer, pdqe_provider, pdqe_reader;
REVOKE ALL ON pdqe.human_reviews FROM anon, authenticated;

-- Postgres grants EXECUTE on new functions to PUBLIC by default — strip it.
REVOKE ALL ON FUNCTION pdqe.check_human_review_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.guard_human_review_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.audit_human_review_queued() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.record_review_decision(UUID, UUID, TEXT, UUID, pdqe.review_decision)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.transition_to_approved(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.transition_to_rejected_by_reviewer(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION pdqe.transition_to_approved(UUID, UUID, TEXT, UUID) TO service_role, pdqe_admin;
GRANT EXECUTE ON FUNCTION pdqe.transition_to_rejected_by_reviewer(UUID, UUID, TEXT, UUID) TO service_role, pdqe_admin;

-- ── 9. Security follow-up: earlier SECURITY DEFINER functions ────────────────
-- Live DB check (2026-10-11) showed these functions still carry the default
-- PUBLIC EXECUTE grant (proacl '=X/postgres'), and pdqe grants USAGE to anon
-- and authenticated — so any API caller could invoke them. Signatures below
-- are the live identity arguments, not the ones in the original migrations.
-- log_security_check is deliberately NOT included: it is invoked from the
-- ingestion_events trigger in the inserting role's context, so revoking
-- PUBLIC needs its own review (see Stage 06 PR notes).

REVOKE ALL ON FUNCTION pdqe.transition_to_extracted(UUID, UUID, TEXT, DOUBLE PRECISION) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.transition_to_classified(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.transition_to_qualified(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.transition_source_state(UUID, TEXT, pdqe.actor_type, TEXT, UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdqe.log_event(pdqe.audit_event_type, UUID, UUID, pdqe.actor_type, TEXT, UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION pdqe.transition_to_extracted(UUID, UUID, TEXT, DOUBLE PRECISION) TO service_role, pdqe_admin;
GRANT EXECUTE ON FUNCTION pdqe.transition_to_classified(UUID, UUID) TO service_role, pdqe_admin;
GRANT EXECUTE ON FUNCTION pdqe.transition_to_qualified(UUID, TEXT, UUID) TO service_role, pdqe_admin;
GRANT EXECUTE ON FUNCTION pdqe.transition_source_state(UUID, TEXT, pdqe.actor_type, TEXT, UUID, TEXT, TEXT, TEXT)
  TO service_role, pdqe_admin;
GRANT EXECUTE ON FUNCTION pdqe.log_event(pdqe.audit_event_type, UUID, UUID, pdqe.actor_type, TEXT, UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
  TO service_role, pdqe_admin;

COMMIT;
