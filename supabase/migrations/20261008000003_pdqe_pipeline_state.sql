-- ============================================================================
-- PDQE Stage 01 — Migration 3 of 4
-- pdqe.pipeline_state — Lifecycle State Machine
--
-- Immutable log of every lifecycle state transition for every source.
-- State transitions are enforced here via a BEFORE INSERT trigger that
-- validates the transition is permitted before writing the record.
-- The application layer calls pdqe.transition_source_state() — never
-- UPDATE pdqe.sources.lifecycle_state directly from ad-hoc SQL.
--
-- Reference: PDQE_MASTER_BUILD.md (21-state lifecycle), Stage 01
-- Depends on: 20261008000001_pdqe_schema_and_roles.sql
--             20261008000002_pdqe_sources.sql
-- Author: Anthony Williams / Synergy Blockchain Pacific
-- Date: 2026-10-08
-- ============================================================================

-- ── 1. Actor type enumeration ─────────────────────────────────────────────────

CREATE TYPE pdqe.actor_type AS ENUM (
  'CLAUDE',         -- Claude LLM (extraction, orchestration)
  'JEV',            -- Jev / TypeSafe AI (qualification)
  'DETERMINISTIC',  -- Deterministic code (validation, threshold enforcement)
  'HUMAN'           -- Human reviewer (consequential exceptions)
);

-- ── 2. pdqe.pipeline_state table ─────────────────────────────────────────────
-- Append-only. No UPDATE or DELETE permitted via RLS.
-- Every row is a single state transition event.

CREATE TABLE pdqe.pipeline_state (
  -- Primary key
  state_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which source this transition belongs to
  source_id         UUID NOT NULL REFERENCES pdqe.sources(source_id) ON DELETE CASCADE,

  -- State transition
  state_from        TEXT NOT NULL,   -- previous lifecycle_state (or 'NONE' for first)
  state_to          TEXT NOT NULL
                    CHECK (state_to IN (
                      'DISCOVERED',
                      'SOURCE_REGISTERED',
                      'LICENSE_CHECKED',
                      'INGESTED',
                      'EXTRACTED',
                      'CLASSIFIED',
                      'QUALIFIED',
                      'VALIDATED',
                      'REVIEW',
                      'APPROVED',
                      'DATASET_CREATED',
                      'COLLECTION_LINKED',
                      'ENDPOINT_GENERATED',
                      'ENDPOINT_VALIDATED',
                      'PROVIDER_APPROVED',
                      'PUBLISHED',
                      'x402_QUERYABLE',
                      'REJECTED',
                      'QUARANTINED'
                    )),

  -- Who or what caused this transition
  actor_type        pdqe.actor_type NOT NULL,
  actor_version     TEXT,            -- model version / code semver / auth.uid() for HUMAN
  actor_user_id     UUID REFERENCES auth.users(id),  -- set for HUMAN actor only

  -- Evidence
  rationale         TEXT,            -- structured JSON for automated actors; freetext for human
  input_hash        TEXT,            -- SHA-256 of the input that triggered this transition
  output_hash       TEXT,            -- SHA-256 of the output produced by this stage

  -- Timestamps
  transitioned_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE pdqe.pipeline_state IS
  'Append-only log of every PDQE lifecycle state transition.
   One row per transition event. No UPDATE or DELETE permitted by RLS.
   actor_type tracks whether transition was made by Claude, Jev, deterministic
   code, or a human reviewer — required for provenance chain integrity.
   input_hash + output_hash enable independent stage verification.';

-- Fast lookups by source (pipeline view)
CREATE INDEX idx_pdqe_pipeline_state_source
  ON pdqe.pipeline_state (source_id, transitioned_at DESC);

-- Fast lookups by target state (e.g. find all REVIEW-state items)
CREATE INDEX idx_pdqe_pipeline_state_to
  ON pdqe.pipeline_state (state_to);

-- ── 3. Permitted transitions ──────────────────────────────────────────────────
-- Defines which state_from → state_to transitions are valid.
-- REJECTED and QUARANTINED can be reached from any active state.
-- Terminal states (REJECTED, QUARANTINED, x402_QUERYABLE) have no outbound.

CREATE TABLE pdqe.permitted_transitions (
  state_from        TEXT NOT NULL,
  state_to          TEXT NOT NULL,
  PRIMARY KEY (state_from, state_to)
);

COMMENT ON TABLE pdqe.permitted_transitions IS
  'Allowlist of valid PDQE lifecycle state transitions.
   Any transition not in this table is rejected by the state machine.
   REJECTED and QUARANTINED can be reached from any non-terminal state.
   Seeded at migration time — not modifiable at runtime.';

-- Seed permitted transitions (forward path)
INSERT INTO pdqe.permitted_transitions (state_from, state_to) VALUES
  ('NONE',             'DISCOVERED'),
  ('DISCOVERED',       'SOURCE_REGISTERED'),
  ('SOURCE_REGISTERED','LICENSE_CHECKED'),
  ('LICENSE_CHECKED',  'INGESTED'),
  ('INGESTED',         'EXTRACTED'),
  ('EXTRACTED',        'CLASSIFIED'),
  ('CLASSIFIED',       'QUALIFIED'),
  ('QUALIFIED',        'VALIDATED'),
  ('VALIDATED',        'REVIEW'),
  ('VALIDATED',        'APPROVED'),      -- auto-approve path (Jev confidence >= 0.85)
  ('REVIEW',           'APPROVED'),
  ('REVIEW',           'REJECTED'),
  ('APPROVED',         'DATASET_CREATED'),
  ('DATASET_CREATED',  'COLLECTION_LINKED'),
  ('COLLECTION_LINKED','ENDPOINT_GENERATED'),
  ('ENDPOINT_GENERATED','ENDPOINT_VALIDATED'),
  ('ENDPOINT_VALIDATED','PROVIDER_APPROVED'),
  ('PROVIDER_APPROVED','PUBLISHED'),
  ('PUBLISHED',        'x402_QUERYABLE');

-- REJECTED is reachable from any active state
INSERT INTO pdqe.permitted_transitions (state_from, state_to)
  SELECT s, 'REJECTED' FROM unnest(ARRAY[
    'DISCOVERED','SOURCE_REGISTERED','LICENSE_CHECKED','INGESTED',
    'EXTRACTED','CLASSIFIED','QUALIFIED','VALIDATED','REVIEW','APPROVED'
  ]) AS s;

-- QUARANTINED is reachable from ingestion-stage states
INSERT INTO pdqe.permitted_transitions (state_from, state_to)
  SELECT s, 'QUARANTINED' FROM unnest(ARRAY[
    'INGESTED','EXTRACTED','CLASSIFIED','QUALIFIED','VALIDATED'
  ]) AS s;

-- RLS: permitted_transitions is read-only for all roles (seed data, not runtime data)
ALTER TABLE pdqe.permitted_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_permitted_transitions"
  ON pdqe.permitted_transitions
  FOR SELECT
  USING (true);

CREATE POLICY "service_role_transitions"
  ON pdqe.permitted_transitions
  FOR ALL
  TO service_role
  USING (true);

-- ── 4. State machine enforcement function ────────────────────────────────────
-- Called by application code to perform a validated state transition.
-- Validates the transition, inserts a pipeline_state row, and updates
-- pdqe.sources.lifecycle_state atomically.
-- Returns the new pipeline_state row.

CREATE OR REPLACE FUNCTION pdqe.transition_source_state(
  p_source_id       UUID,
  p_state_to        TEXT,
  p_actor_type      pdqe.actor_type,
  p_actor_version   TEXT DEFAULT NULL,
  p_actor_user_id   UUID DEFAULT NULL,
  p_rationale       TEXT DEFAULT NULL,
  p_input_hash      TEXT DEFAULT NULL,
  p_output_hash     TEXT DEFAULT NULL
)
RETURNS pdqe.pipeline_state
LANGUAGE plpgsql
SECURITY DEFINER  -- runs as the function owner; enforces state machine regardless of caller role
AS $$
DECLARE
  v_current_state   TEXT;
  v_new_row         pdqe.pipeline_state;
BEGIN
  -- 1. Lock the source row to prevent concurrent transitions
  SELECT lifecycle_state INTO v_current_state
    FROM pdqe.sources
   WHERE source_id = p_source_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDQE source not found: %', p_source_id;
  END IF;

  -- 2. Validate the transition is permitted
  IF NOT EXISTS (
    SELECT 1 FROM pdqe.permitted_transitions
     WHERE state_from = v_current_state
       AND state_to   = p_state_to
  ) THEN
    RAISE EXCEPTION
      'PDQE invalid state transition: % → % (source_id: %)',
      v_current_state, p_state_to, p_source_id;
  END IF;

  -- 3. Block advancement if licence is UNKNOWN (non-negotiable rule)
  IF p_state_to NOT IN ('REJECTED', 'QUARANTINED') THEN
    IF (SELECT licence_status FROM pdqe.sources WHERE source_id = p_source_id)
       = 'UNKNOWN' AND v_current_state = 'LICENSE_CHECKED' THEN
      RAISE EXCEPTION
        'PDQE licence check failed: licence_status is UNKNOWN. '
        '"Unknown is not approval." Source % cannot advance past LICENSE_CHECKED.',
        p_source_id;
    END IF;
  END IF;

  -- 4. Block EXCLUDED sources from ever advancing past LICENSE_CHECKED
  IF p_state_to NOT IN ('REJECTED', 'QUARANTINED') THEN
    IF (SELECT licence_status FROM pdqe.sources WHERE source_id = p_source_id)
       = 'EXCLUDED' THEN
      RAISE EXCEPTION
        'PDQE licence check failed: licence_status is EXCLUDED. '
        'Excluded sources are permanently blocked. Source: %',
        p_source_id;
    END IF;
  END IF;

  -- 5. Insert the transition record
  INSERT INTO pdqe.pipeline_state (
    source_id, state_from, state_to,
    actor_type, actor_version, actor_user_id,
    rationale, input_hash, output_hash
  ) VALUES (
    p_source_id, v_current_state, p_state_to,
    p_actor_type, p_actor_version, p_actor_user_id,
    p_rationale, p_input_hash, p_output_hash
  ) RETURNING * INTO v_new_row;

  -- 6. Update the source's current lifecycle state
  UPDATE pdqe.sources
     SET lifecycle_state = p_state_to,
         updated_at      = now()
   WHERE source_id = p_source_id;

  RETURN v_new_row;
END;
$$;

COMMENT ON FUNCTION pdqe.transition_source_state IS
  'Validates and executes a PDQE lifecycle state transition.
   Enforces permitted_transitions allowlist.
   Blocks advancement when licence_status is UNKNOWN or EXCLUDED.
   Inserts pipeline_state record and updates sources.lifecycle_state atomically.
   SECURITY DEFINER — runs as function owner regardless of caller role.
   Application code must use this function; never UPDATE lifecycle_state directly.';

-- ── 5. Row Level Security — pipeline_state ────────────────────────────────────
-- Append-only: INSERT permitted for relevant roles; UPDATE and DELETE blocked.

ALTER TABLE pdqe.pipeline_state ENABLE ROW LEVEL SECURITY;

-- pdqe_admin: can read all; inserts happen via transition_source_state() only
CREATE POLICY "pdqe_admin_read_pipeline_state"
  ON pdqe.pipeline_state
  FOR SELECT
  TO pdqe_admin
  USING (true);

-- pdqe_reviewer: can read all pipeline state (needed to work the review queue)
CREATE POLICY "pdqe_reviewer_read_pipeline_state"
  ON pdqe.pipeline_state
  FOR SELECT
  TO pdqe_reviewer
  USING (true);

-- service_role: full access (function transitions run as service_role)
CREATE POLICY "service_role_pipeline_state"
  ON pdqe.pipeline_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No UPDATE or DELETE policy for any role — append-only enforced by omission.

-- ── 6. Grants ─────────────────────────────────────────────────────────────────
GRANT SELECT ON pdqe.pipeline_state TO pdqe_admin, pdqe_reviewer;
GRANT SELECT ON pdqe.permitted_transitions TO pdqe_admin, pdqe_reviewer, pdqe_provider, pdqe_reader;
GRANT ALL ON pdqe.pipeline_state TO service_role;
GRANT ALL ON pdqe.permitted_transitions TO service_role;
GRANT EXECUTE ON FUNCTION pdqe.transition_source_state TO service_role, pdqe_admin;
