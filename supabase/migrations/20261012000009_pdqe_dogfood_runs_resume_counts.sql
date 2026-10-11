-- ============================================================================
-- PDQE Stage 10.1 — idempotent resume outcome counts on pdqe.dogfood_runs
--
-- Re-running a corpus no longer fails on sources an earlier run already
-- handled (app/dogfood/pipeline_client.py). Those sources are recorded as
-- ALREADY_PROCESSED (EXTRACTED or later) or SKIPPED_PREVIOUSLY_REJECTED
-- (REJECTED / QUARANTINED) and counted separately — neither successes nor
-- failures — so the bucket constraint must include both new counts.
--
-- Depends on: 20261012000007_pdqe_dogfood_runs.sql
-- Date: 2026-10-12
--
-- ADDITIVE: existing rows default both new counts to 0 and remain consistent.
-- Apply BEFORE deploying the pdqe-pipeline code that writes these columns.
-- ============================================================================

ALTER TABLE pdqe.dogfood_runs
  ADD COLUMN sources_already_processed INTEGER NOT NULL DEFAULT 0
    CHECK (sources_already_processed >= 0),
  ADD COLUMN sources_skipped_previously_rejected INTEGER NOT NULL DEFAULT 0
    CHECK (sources_skipped_previously_rejected >= 0);

-- Every attempted source still lands in exactly one bucket.
ALTER TABLE pdqe.dogfood_runs DROP CONSTRAINT dogfood_runs_counts_consistent;
ALTER TABLE pdqe.dogfood_runs ADD CONSTRAINT dogfood_runs_counts_consistent CHECK (
  sources_attempted = sources_succeeded + sources_failed + sources_routed_to_review
    + sources_already_processed + sources_skipped_previously_rejected
);

COMMENT ON COLUMN pdqe.dogfood_runs.sources_already_processed IS
  'Sources an earlier run had already taken to EXTRACTED or later; skipped, not re-run.';
COMMENT ON COLUMN pdqe.dogfood_runs.sources_skipped_previously_rejected IS
  'Sources an earlier run (or a reviewer) had REJECTED or QUARANTINED; skipped, not re-run.';
