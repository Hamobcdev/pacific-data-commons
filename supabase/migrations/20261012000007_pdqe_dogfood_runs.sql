-- ============================================================================
-- PDQE Stage 10 — Migration 1 of 1
-- pdqe.dogfood_runs — Internal Dogfooding run tracking
--
-- One row per corpus run (app/dogfood/runner.py). A run drives the seed
-- sources of one corpus (corpus/<name>.json) through the pipeline and
-- records outcomes: successes, failure modes by stage, licence results,
-- review frequency. A dry run validates seed definitions only and writes
-- no pipeline rows; whether its report is recorded here is a separate,
-- explicit opt-in (DogfoodRunInput.record_run).
--
-- corpus vs domain: the five Stage 10 corpora are FISHERIES, CLIMATE, TRADE,
-- TOURISM and HEALTH. TOURISM is not a pdqe.domain_classification value, so
-- `corpus` records which seed file ran and `domain` records the primary
-- domain classification of that corpus (TOURISM → ECONOMICS).
--
-- Reference: PDQE_MASTER_BUILD.md, Stage 10
-- Depends on: 20261008000001_pdqe_schema_and_roles.sql
--             20261011000001_pdqe_jev_assessments.sql (pdqe.domain_classification)
--             20261012000005_pdqe_add_health_domain.sql (HEALTH)
-- Date: 2026-10-12
--
-- ADDITIVE ONLY — does not alter any existing PDQE or PDC tables
-- ============================================================================

CREATE TABLE pdqe.dogfood_runs (
  run_id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_label                 TEXT NOT NULL
                            CHECK (char_length(trim(run_label)) BETWEEN 1 AND 200),
  corpus                    TEXT NOT NULL
                            CHECK (corpus IN ('FISHERIES','CLIMATE','TRADE','TOURISM','HEALTH')),
  domain                    pdqe.domain_classification NOT NULL,
  dry_run                   BOOLEAN NOT NULL DEFAULT TRUE,

  sources_attempted         INTEGER NOT NULL DEFAULT 0 CHECK (sources_attempted >= 0),
  sources_succeeded         INTEGER NOT NULL DEFAULT 0 CHECK (sources_succeeded >= 0),
  sources_failed            INTEGER NOT NULL DEFAULT 0 CHECK (sources_failed >= 0),
  sources_routed_to_review  INTEGER NOT NULL DEFAULT 0 CHECK (sources_routed_to_review >= 0),

  failure_modes             JSONB NOT NULL DEFAULT '[]'::jsonb
                            CHECK (jsonb_typeof(failure_modes) = 'array'),
  licence_outcomes          JSONB NOT NULL DEFAULT '{}'::jsonb
                            CHECK (jsonb_typeof(licence_outcomes) = 'object'),
  run_report                JSONB NOT NULL DEFAULT '{}'::jsonb
                            CHECK (jsonb_typeof(run_report) = 'object'),

  started_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at              TIMESTAMPTZ,
  status                    TEXT NOT NULL DEFAULT 'RUNNING'
                            CHECK (status IN ('RUNNING','COMPLETE','FAILED')),

  -- Every attempted source lands in exactly one bucket.
  CONSTRAINT dogfood_runs_counts_consistent CHECK (
    sources_attempted = sources_succeeded + sources_failed + sources_routed_to_review
  ),
  -- A finished run has a completion time no earlier than its start.
  CONSTRAINT dogfood_runs_completion_consistent CHECK (
    (status = 'RUNNING' AND completed_at IS NULL)
    OR (status <> 'RUNNING' AND completed_at IS NOT NULL AND completed_at >= started_at)
  )
);

COMMENT ON TABLE pdqe.dogfood_runs IS
  'PDQE Stage 10 — one row per internal dogfooding corpus run.
   Records outcome counts, failure modes by stage and licence outcomes.
   Append-only from the application''s point of view: no DELETE for any
   non-service role.';

COMMENT ON COLUMN pdqe.dogfood_runs.corpus IS
  'Seed corpus that ran (corpus/<name>.json). TOURISM has no matching
   domain_classification value — see domain.';

COMMENT ON COLUMN pdqe.dogfood_runs.dry_run IS
  'TRUE = seed definitions validated only; no pipeline rows were written.';

CREATE INDEX idx_pdqe_dogfood_runs_started ON pdqe.dogfood_runs (started_at DESC);
CREATE INDEX idx_pdqe_dogfood_runs_corpus  ON pdqe.dogfood_runs (corpus, started_at DESC);

-- ── Row Level Security ─────────────────────────────────────────────────────────

ALTER TABLE pdqe.dogfood_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdqe_admin_read_dogfood_runs"    ON pdqe.dogfood_runs FOR SELECT TO pdqe_admin USING (true);
CREATE POLICY "pdqe_admin_insert_dogfood_runs"  ON pdqe.dogfood_runs FOR INSERT TO pdqe_admin WITH CHECK (true);
CREATE POLICY "pdqe_admin_update_dogfood_runs"  ON pdqe.dogfood_runs FOR UPDATE TO pdqe_admin USING (true) WITH CHECK (true);
CREATE POLICY "pdqe_reviewer_read_dogfood_runs" ON pdqe.dogfood_runs FOR SELECT TO pdqe_reviewer USING (true);
CREATE POLICY "service_role_all_dogfood_runs"   ON pdqe.dogfood_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Grants ─────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON pdqe.dogfood_runs TO pdqe_admin;
GRANT SELECT ON pdqe.dogfood_runs TO pdqe_reviewer;
GRANT ALL ON pdqe.dogfood_runs TO service_role;

REVOKE DELETE ON pdqe.dogfood_runs FROM pdqe_admin, pdqe_reviewer;
REVOKE ALL ON pdqe.dogfood_runs FROM pdqe_provider, pdqe_reader, anon, authenticated;
