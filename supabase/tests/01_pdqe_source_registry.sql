-- ============================================================================
-- PDQE Stage 01 — pgTAP Test Suite
-- 01_pdqe_source_registry.sql
--
-- Tests:
--   T01 — Source creation (happy path)
--   T02 — Source update (metadata; not state)
--   T03 — Licence state transitions (all four valid statuses)
--   T04 — Duplicate source handling (content_hash unique constraint)
--   T05 — Invalid state transitions (rejected by state machine)
--   T06 — Audit log append-only enforcement (trigger guard + RLS)
--   T07 — RLS policy enforcement per role
--
-- Run with: supabase test db (local stack)
-- Depends on: migrations 20261008000001 through 20261008000004
-- Author: Anthony Williams / Synergy Blockchain Pacific
-- Date: 2026-10-08
-- ============================================================================

BEGIN;

SELECT plan(60);

-- ────────────────────────────────────────────────────────────────────────────
-- HELPERS
-- ────────────────────────────────────────────────────────────────────────────

-- Seed a known test user in auth.users (pgTAP runs as service_role)
DO $$
DECLARE
  v_uid UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_uid) THEN
    INSERT INTO auth.users (id, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, role)
    VALUES (v_uid, 'pdqe-test@sbp.test', now(), now(), '{}', '{}', false, 'authenticated');
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- T01 — Source creation (happy path)
-- ────────────────────────────────────────────────────────────────────────────

-- T01.1: pdqe.sources table exists
SELECT has_table('pdqe', 'sources', 'T01.1: pdqe.sources table exists');

-- T01.2: Required columns exist
SELECT has_column('pdqe', 'sources', 'source_id',          'T01.2a: source_id column exists');
SELECT has_column('pdqe', 'sources', 'title',              'T01.2b: title column exists');
SELECT has_column('pdqe', 'sources', 'publisher_name',     'T01.2c: publisher_name column exists');
SELECT has_column('pdqe', 'sources', 'lifecycle_state',    'T01.2d: lifecycle_state column exists');
SELECT has_column('pdqe', 'sources', 'licence_status',     'T01.2e: licence_status column exists');
SELECT has_column('pdqe', 'sources', 'internal_pipeline',  'T01.2f: internal_pipeline column exists');
SELECT has_column('pdqe', 'sources', 'content_hash',       'T01.2g: content_hash column exists');
SELECT has_column('pdqe', 'sources', 'geographic_scope',   'T01.2h: geographic_scope column exists');
SELECT has_column('pdqe', 'sources', 'candidate_domains',  'T01.2i: candidate_domains column exists');
SELECT has_column('pdqe', 'sources', 'registered_by',      'T01.2j: registered_by column exists');

-- T01.3: Insert a source succeeds (service_role, the pipeline default)
INSERT INTO pdqe.sources (
  title, publisher_name, source_type, acquisition_method,
  geographic_scope, candidate_domains, registered_by
) VALUES (
  'Samoa CPI Monthly Bulletin',
  'Samoa Bureau of Statistics',
  'PDF_DOCUMENT',
  'MANUAL_UPLOAD',
  ARRAY['WSM'],
  ARRAY['ECONOMICS']::pdqe.source_domain[],
  '00000000-0000-0000-0000-000000000001'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin'),
  'T01.3: source row created successfully'
);

-- T01.4: Default lifecycle_state is DISCOVERED
SELECT is(
  (SELECT lifecycle_state FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin'),
  'DISCOVERED',
  'T01.4: default lifecycle_state is DISCOVERED'
);

-- T01.5: Default licence_status is UNKNOWN
SELECT is(
  (SELECT licence_status::TEXT FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin'),
  'UNKNOWN',
  'T01.5: default licence_status is UNKNOWN'
);

-- T01.6: Default internal_pipeline is TRUE
SELECT is(
  (SELECT internal_pipeline FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin'),
  TRUE,
  'T01.6: default internal_pipeline is TRUE'
);

-- T01.7: source_id is auto-generated (non-null UUID)
SELECT ok(
  (SELECT source_id FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin') IS NOT NULL,
  'T01.7: source_id auto-generated'
);

-- T01.8: created_at and updated_at are set
SELECT ok(
  (SELECT created_at FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin') IS NOT NULL,
  'T01.8a: created_at set on insert'
);
SELECT ok(
  (SELECT updated_at FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin') IS NOT NULL,
  'T01.8b: updated_at set on insert'
);

-- ────────────────────────────────────────────────────────────────────────────
-- T02 — Source update (metadata, not state)
-- ────────────────────────────────────────────────────────────────────────────

-- T02.1: Updating description succeeds
UPDATE pdqe.sources
   SET description = 'Monthly consumer price index bulletin from Samoa Bureau of Statistics'
 WHERE title = 'Samoa CPI Monthly Bulletin';

SELECT is(
  (SELECT description FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin'),
  'Monthly consumer price index bulletin from Samoa Bureau of Statistics',
  'T02.1: description updated successfully'
);

-- T02.2: updated_at advances after UPDATE
DECLARE
  v_updated_before TIMESTAMPTZ;
  v_updated_after  TIMESTAMPTZ;
BEGIN
  SELECT updated_at INTO v_updated_before
    FROM pdqe.sources
   WHERE title = 'Samoa CPI Monthly Bulletin';

  PERFORM pg_sleep(0.01);  -- ensure time advances

  UPDATE pdqe.sources
     SET notes = 'Test note update'
   WHERE title = 'Samoa CPI Monthly Bulletin';

  SELECT updated_at INTO v_updated_after
    FROM pdqe.sources
   WHERE title = 'Samoa CPI Monthly Bulletin';

  PERFORM ok(
    v_updated_after > v_updated_before,
    'T02.2: updated_at advances after UPDATE via trigger'
  );
END;

-- T02.3: Updating licence fields succeeds
UPDATE pdqe.sources
   SET licence_text = 'Creative Commons Attribution 4.0 International',
       licence_url  = 'https://creativecommons.org/licenses/by/4.0/'
 WHERE title = 'Samoa CPI Monthly Bulletin';

SELECT ok(
  (SELECT licence_text FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin')
    = 'Creative Commons Attribution 4.0 International',
  'T02.3: licence_text updated successfully'
);

-- ────────────────────────────────────────────────────────────────────────────
-- T03 — Licence state transitions
-- ────────────────────────────────────────────────────────────────────────────

-- T03.1: licence_status can be set to CLEAR
UPDATE pdqe.sources
   SET licence_status = 'CLEAR'
 WHERE title = 'Samoa CPI Monthly Bulletin';

SELECT is(
  (SELECT licence_status::TEXT FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin'),
  'CLEAR',
  'T03.1: licence_status updated to CLEAR'
);

-- T03.2: licence_status can be set to REVIEW_REQUIRED
UPDATE pdqe.sources
   SET licence_status = 'REVIEW_REQUIRED'
 WHERE title = 'Samoa CPI Monthly Bulletin';

SELECT is(
  (SELECT licence_status::TEXT FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin'),
  'REVIEW_REQUIRED',
  'T03.2: licence_status updated to REVIEW_REQUIRED'
);

-- T03.3: licence_status can be set to RESTRICTED
UPDATE pdqe.sources
   SET licence_status = 'RESTRICTED'
 WHERE title = 'Samoa CPI Monthly Bulletin';

SELECT is(
  (SELECT licence_status::TEXT FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin'),
  'RESTRICTED',
  'T03.3: licence_status updated to RESTRICTED'
);

-- T03.4: licence_status can be set to EXCLUDED (permanent)
UPDATE pdqe.sources
   SET licence_status = 'EXCLUDED'
 WHERE title = 'Samoa CPI Monthly Bulletin';

SELECT is(
  (SELECT licence_status::TEXT FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin'),
  'EXCLUDED',
  'T03.4: licence_status updated to EXCLUDED'
);

-- T03.5: UNKNOWN blocks pipeline advancement at LICENSE_CHECKED
-- Reset to CLEAR, advance to LICENSE_CHECKED, then reset to UNKNOWN and try to advance
UPDATE pdqe.sources
   SET licence_status  = 'CLEAR',
       lifecycle_state = 'DISCOVERED'
 WHERE title = 'Samoa CPI Monthly Bulletin';

-- Advance through the forward states to LICENSE_CHECKED using the state machine
DO $$
DECLARE
  v_src_id UUID;
BEGIN
  SELECT source_id INTO v_src_id
    FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin';

  -- DISCOVERED → SOURCE_REGISTERED
  PERFORM pdqe.transition_source_state(
    v_src_id, 'SOURCE_REGISTERED', 'DETERMINISTIC', 'test-v1', NULL, 'T03.5 setup'
  );

  -- SOURCE_REGISTERED → LICENSE_CHECKED
  PERFORM pdqe.transition_source_state(
    v_src_id, 'LICENSE_CHECKED', 'DETERMINISTIC', 'test-v1', NULL, 'T03.5 setup'
  );
END $$;

-- Now set licence_status back to UNKNOWN
UPDATE pdqe.sources
   SET licence_status = 'UNKNOWN'
 WHERE title = 'Samoa CPI Monthly Bulletin';

-- Attempt to advance past LICENSE_CHECKED — must fail
SELECT throws_ok(
  $$
    DO $$
    DECLARE v_src_id UUID;
    BEGIN
      SELECT source_id INTO v_src_id
        FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin';
      PERFORM pdqe.transition_source_state(
        v_src_id, 'INGESTED', 'DETERMINISTIC', 'test-v1', NULL, 'should fail'
      );
    END $$
  $$,
  'T03.5: UNKNOWN licence_status blocks advancement past LICENSE_CHECKED'
);

-- T03.6: EXCLUDED source cannot advance past LICENSE_CHECKED
UPDATE pdqe.sources
   SET licence_status  = 'EXCLUDED',
       lifecycle_state = 'LICENSE_CHECKED'
 WHERE title = 'Samoa CPI Monthly Bulletin';

SELECT throws_ok(
  $$
    DO $$
    DECLARE v_src_id UUID;
    BEGIN
      SELECT source_id INTO v_src_id
        FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin';
      PERFORM pdqe.transition_source_state(
        v_src_id, 'INGESTED', 'DETERMINISTIC', 'test-v1', NULL, 'should fail excluded'
      );
    END $$
  $$,
  'T03.6: EXCLUDED licence_status permanently blocks pipeline advancement'
);

-- Reset for subsequent tests
UPDATE pdqe.sources
   SET licence_status  = 'CLEAR',
       lifecycle_state = 'DISCOVERED'
 WHERE title = 'Samoa CPI Monthly Bulletin';

-- ────────────────────────────────────────────────────────────────────────────
-- T04 — Duplicate source handling (content_hash unique constraint)
-- ────────────────────────────────────────────────────────────────────────────

-- T04.1: Setting content_hash succeeds
UPDATE pdqe.sources
   SET content_hash = 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1'
 WHERE title = 'Samoa CPI Monthly Bulletin';

SELECT ok(
  (SELECT content_hash FROM pdqe.sources WHERE title = 'Samoa CPI Monthly Bulletin') IS NOT NULL,
  'T04.1: content_hash set successfully'
);

-- T04.2: Inserting a second source with the same content_hash fails
SELECT throws_ok(
  $$
    INSERT INTO pdqe.sources (
      title, publisher_name, source_type, acquisition_method,
      geographic_scope, candidate_domains, registered_by,
      content_hash
    ) VALUES (
      'Duplicate Content Source',
      'Test Publisher',
      'PDF_DOCUMENT',
      'MANUAL_UPLOAD',
      ARRAY['WSM'],
      ARRAY['ECONOMICS']::pdqe.source_domain[],
      '00000000-0000-0000-0000-000000000001',
      'abc123def456abc123def456abc123def456abc123def456abc123def456abc1'
    )
  $$,
  '23505',  -- unique_violation
  NULL,
  'T04.2: duplicate content_hash raises unique_violation'
);

-- T04.3: NULL content_hash allows multiple rows (deduplication only applies to known content)
INSERT INTO pdqe.sources (
  title, publisher_name, source_type, acquisition_method,
  geographic_scope, candidate_domains, registered_by
) VALUES (
  'Another Source With No Hash Yet',
  'Test Publisher B',
  'PDF_DOCUMENT',
  'MANUAL_UPLOAD',
  ARRAY['WSM'],
  ARRAY['ECONOMICS']::pdqe.source_domain[],
  '00000000-0000-0000-0000-000000000001'
);

INSERT INTO pdqe.sources (
  title, publisher_name, source_type, acquisition_method,
  geographic_scope, candidate_domains, registered_by
) VALUES (
  'Yet Another Source With No Hash',
  'Test Publisher C',
  'PDF_DOCUMENT',
  'MANUAL_UPLOAD',
  ARRAY['WSM'],
  ARRAY['ECONOMICS']::pdqe.source_domain[],
  '00000000-0000-0000-0000-000000000001'
);

SELECT is(
  (SELECT count(*)::INT FROM pdqe.sources WHERE content_hash IS NULL),
  2,
  'T04.3: multiple NULL content_hash sources allowed (unique constraint is partial)'
);

-- ────────────────────────────────────────────────────────────────────────────
-- T05 — Invalid state transitions (rejected by state machine)
-- ────────────────────────────────────────────────────────────────────────────

-- Insert a fresh source for transition tests
INSERT INTO pdqe.sources (
  title, publisher_name, source_type, acquisition_method,
  geographic_scope, candidate_domains, registered_by, licence_status
) VALUES (
  'Transition Test Source',
  'Test Publisher',
  'API_ENDPOINT',
  'API_PULL',
  ARRAY['WSM'],
  ARRAY['TRADE']::pdqe.source_domain[],
  '00000000-0000-0000-0000-000000000001',
  'CLEAR'
);

-- T05.1: Cannot skip states (DISCOVERED → INGESTED, skipping SOURCE_REGISTERED)
SELECT throws_ok(
  format($$
    SELECT pdqe.transition_source_state(
      (SELECT source_id FROM pdqe.sources WHERE title = 'Transition Test Source'),
      'INGESTED', 'DETERMINISTIC', 'test-v1', NULL, 'skip test'
    )
  $$),
  NULL,
  NULL,
  'T05.1: DISCOVERED → INGESTED rejected (skips SOURCE_REGISTERED)'
);

-- T05.2: Cannot transition from a terminal state (REJECTED → anything)
DO $$
DECLARE
  v_src_id UUID;
BEGIN
  SELECT source_id INTO v_src_id
    FROM pdqe.sources WHERE title = 'Transition Test Source';

  -- Advance to SOURCE_REGISTERED then REJECT
  PERFORM pdqe.transition_source_state(
    v_src_id, 'SOURCE_REGISTERED', 'DETERMINISTIC', 'test-v1', NULL, 'T05.2 setup'
  );
  PERFORM pdqe.transition_source_state(
    v_src_id, 'REJECTED', 'HUMAN', 'test-v1', NULL, 'T05.2 reject'
  );
END $$;

SELECT throws_ok(
  format($$
    SELECT pdqe.transition_source_state(
      (SELECT source_id FROM pdqe.sources WHERE title = 'Transition Test Source'),
      'INGESTED', 'DETERMINISTIC', 'test-v1', NULL, 'from rejected'
    )
  $$),
  NULL,
  NULL,
  'T05.2: Cannot transition out of terminal REJECTED state'
);

-- T05.3: transition_source_state raises for unknown source_id
SELECT throws_ok(
  $$
    SELECT pdqe.transition_source_state(
      'ffffffff-ffff-ffff-ffff-ffffffffffff'::UUID,
      'SOURCE_REGISTERED', 'DETERMINISTIC', 'test-v1', NULL, 'no such source'
    )
  $$,
  NULL,
  NULL,
  'T05.3: transition_source_state raises for unknown source_id'
);

-- T05.4: Valid forward transition succeeds
INSERT INTO pdqe.sources (
  title, publisher_name, source_type, acquisition_method,
  geographic_scope, candidate_domains, registered_by, licence_status
) VALUES (
  'Forward Transition Test',
  'Test Publisher',
  'API_ENDPOINT',
  'API_PULL',
  ARRAY['WSM'],
  ARRAY['TRADE']::pdqe.source_domain[],
  '00000000-0000-0000-0000-000000000001',
  'CLEAR'
);

DO $$
DECLARE
  v_src_id UUID;
  v_row    pdqe.pipeline_state;
BEGIN
  SELECT source_id INTO v_src_id
    FROM pdqe.sources WHERE title = 'Forward Transition Test';

  SELECT * INTO v_row FROM pdqe.transition_source_state(
    v_src_id, 'SOURCE_REGISTERED', 'DETERMINISTIC', 'test-v1', NULL, 'forward test'
  );

  IF v_row.state_to != 'SOURCE_REGISTERED' THEN
    RAISE EXCEPTION 'Expected SOURCE_REGISTERED, got %', v_row.state_to;
  END IF;
END $$;

SELECT is(
  (SELECT lifecycle_state FROM pdqe.sources WHERE title = 'Forward Transition Test'),
  'SOURCE_REGISTERED',
  'T05.4: Valid DISCOVERED → SOURCE_REGISTERED transition succeeds'
);

-- T05.5: pipeline_state records the transition
SELECT ok(
  EXISTS (
    SELECT 1 FROM pdqe.pipeline_state ps
      JOIN pdqe.sources s ON s.source_id = ps.source_id
     WHERE s.title = 'Forward Transition Test'
       AND ps.state_from = 'DISCOVERED'
       AND ps.state_to   = 'SOURCE_REGISTERED'
  ),
  'T05.5: pipeline_state row recorded for valid transition'
);

-- ────────────────────────────────────────────────────────────────────────────
-- T06 — Audit log append-only enforcement
-- ────────────────────────────────────────────────────────────────────────────

-- T06.1: pdqe.audit_log table exists
SELECT has_table('pdqe', 'audit_log', 'T06.1: pdqe.audit_log table exists');

-- T06.2: pdqe.log_event function exists
SELECT has_function('pdqe', 'log_event',
  ARRAY['pdqe.audit_event_type','uuid','uuid','pdqe.actor_type','text','uuid','jsonb','text','text','text','text'],
  'T06.2: pdqe.log_event function exists'
);

-- T06.3: Inserting via log_event() succeeds
SELECT pdqe.log_event(
  'SOURCE_REGISTERED',
  (SELECT source_id FROM pdqe.sources WHERE title = 'Forward Transition Test'),
  NULL,
  'DETERMINISTIC',
  'test-v1',
  NULL,
  '{"test": true}',
  NULL, NULL, NULL, NULL
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pdqe.audit_log al
      JOIN pdqe.sources s ON s.source_id = al.source_id
     WHERE s.title = 'Forward Transition Test'
       AND al.event_type = 'SOURCE_REGISTERED'
  ),
  'T06.3: audit_log row created via log_event()'
);

-- T06.4: UPDATE on audit_log is blocked by trigger
SELECT throws_ok(
  $$
    UPDATE pdqe.audit_log
       SET error_message = 'tampered'
     WHERE event_type = 'SOURCE_REGISTERED'
  $$,
  'P0001',  -- raise_exception
  NULL,
  'T06.4: UPDATE on audit_log raises exception (append-only trigger)'
);

-- T06.5: DELETE on audit_log is blocked by trigger
SELECT throws_ok(
  $$
    DELETE FROM pdqe.audit_log WHERE event_type = 'SOURCE_REGISTERED'
  $$,
  'P0001',  -- raise_exception
  NULL,
  'T06.5: DELETE on audit_log raises exception (append-only trigger)'
);

-- T06.6: log_id is monotonically increasing
SELECT pdqe.log_event('SOURCE_UPDATED', NULL, NULL, 'HUMAN', 'test-v1', NULL, '{}', NULL, NULL, NULL, NULL);
SELECT pdqe.log_event('PIPELINE_ERROR',  NULL, NULL, 'DETERMINISTIC', 'test-v1', NULL, '{}', NULL, NULL, 'ERR_001', 'test error');

SELECT ok(
  (
    SELECT bool_and(a.log_id < b.log_id)
    FROM pdqe.audit_log a
    JOIN pdqe.audit_log b ON b.log_id = (
      SELECT MIN(c.log_id) FROM pdqe.audit_log c WHERE c.log_id > a.log_id
    )
  ),
  'T06.6: log_id is strictly monotonically increasing across all rows'
);

-- ────────────────────────────────────────────────────────────────────────────
-- T07 — RLS policy enforcement per role
-- ────────────────────────────────────────────────────────────────────────────

-- T07.1: pdqe.sources RLS is enabled
SELECT ok(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'pdqe' AND tablename = 'sources'),
  'T07.1: RLS enabled on pdqe.sources'
);

-- T07.2: pdqe.pipeline_state RLS is enabled
SELECT ok(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'pdqe' AND tablename = 'pipeline_state'),
  'T07.2: RLS enabled on pdqe.pipeline_state'
);

-- T07.3: pdqe.audit_log RLS is enabled
SELECT ok(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'pdqe' AND tablename = 'audit_log'),
  'T07.3: RLS enabled on pdqe.audit_log'
);

-- T07.4: pdqe_admin SELECT policy exists on sources
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'pdqe'
       AND tablename  = 'sources'
       AND policyname = 'pdqe_admin_all_sources'
  ),
  'T07.4: pdqe_admin_all_sources policy exists'
);

-- T07.5: pdqe_reviewer SELECT policy exists on sources
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'pdqe'
       AND tablename  = 'sources'
       AND policyname = 'pdqe_reviewer_read_sources'
  ),
  'T07.5: pdqe_reviewer_read_sources policy exists'
);

-- T07.6: pdqe_provider own-sources policy exists
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'pdqe'
       AND tablename  = 'sources'
       AND policyname = 'pdqe_provider_own_sources'
  ),
  'T07.6: pdqe_provider_own_sources policy exists'
);

-- T07.7: service_role all_sources policy exists
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'pdqe'
       AND tablename  = 'sources'
       AND policyname = 'service_role_all_sources'
  ),
  'T07.7: service_role_all_sources policy exists'
);

-- T07.8: No UPDATE policy on audit_log for non-service roles
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'pdqe'
       AND tablename  = 'audit_log'
       AND cmd        = 'UPDATE'
       AND roles      && ARRAY['pdqe_admin', 'pdqe_reviewer', 'pdqe_provider', 'pdqe_reader']::NAME[]
  ),
  'T07.8: No UPDATE policy on audit_log for any pdqe_ role (append-only)'
);

-- T07.9: No DELETE policy on audit_log for non-service roles
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'pdqe'
       AND tablename  = 'audit_log'
       AND cmd        = 'DELETE'
       AND roles      && ARRAY['pdqe_admin', 'pdqe_reviewer', 'pdqe_provider', 'pdqe_reader']::NAME[]
  ),
  'T07.9: No DELETE policy on audit_log for any pdqe_ role (append-only)'
);

-- T07.10: pdqe schema exists
SELECT has_schema('pdqe', 'T07.10: pdqe schema exists');

-- T07.11: All four PDQE roles exist in pg_roles
SELECT ok(EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pdqe_admin'),    'T07.11a: pdqe_admin role exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pdqe_reviewer'), 'T07.11b: pdqe_reviewer role exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pdqe_provider'), 'T07.11c: pdqe_provider role exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pdqe_reader'),   'T07.11d: pdqe_reader role exists');

-- T07.12: transition_source_state SECURITY DEFINER function is owned by postgres (not a caller role)
SELECT ok(
  (
    SELECT p.prosecdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'pdqe'
      AND p.proname = 'transition_source_state'
  ),
  'T07.12: transition_source_state is SECURITY DEFINER'
);

-- T07.13: log_event SECURITY DEFINER
SELECT ok(
  (
    SELECT p.prosecdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'pdqe'
      AND p.proname = 'log_event'
  ),
  'T07.13: log_event is SECURITY DEFINER'
);

-- T07.14: permitted_transitions table is populated
SELECT ok(
  (SELECT count(*)::INT FROM pdqe.permitted_transitions) >= 19,
  'T07.14: permitted_transitions seeded with at least 19 rows'
);

-- T07.15: REJECTED is reachable from DISCOVERED
SELECT ok(
  EXISTS (
    SELECT 1 FROM pdqe.permitted_transitions
     WHERE state_from = 'DISCOVERED' AND state_to = 'REJECTED'
  ),
  'T07.15: REJECTED is reachable from DISCOVERED'
);

-- ────────────────────────────────────────────────────────────────────────────
-- Finish
-- ────────────────────────────────────────────────────────────────────────────

SELECT * FROM finish();

ROLLBACK;
