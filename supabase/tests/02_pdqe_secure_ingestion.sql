-- ============================================================================
-- PDQE Stage 02 — pgTAP Test Suite
-- 02_pdqe_secure_ingestion.sql
--
-- Tests:
--   T01 — ingestion_events table exists with correct columns
--   T02 — Layer 1 whitelist enforcement (accept whitelisted, reject others)
--   T03 — upload_security_log append-only enforcement (trigger + RLS)
--   T04 — RLS policy enforcement per role on new tables
--   T05 — Stage 01 objects untouched (lightweight regression guard — run
--         01_pdqe_source_registry.sql separately for the full Stage 01 suite)
--
-- Run with: supabase test db (local stack)
-- Depends on: migrations 20261008000001 through 20261008000005
-- Author: Anthony Williams / Synergy Blockchain Pacific
-- Date: 2026-10-08
-- ============================================================================

BEGIN;

SELECT plan(42);

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

-- Seed a source row to attach ingestion attempts to (FK requirement)
INSERT INTO pdqe.sources (
  title, publisher_name, source_type, acquisition_method,
  geographic_scope, candidate_domains, registered_by
) VALUES (
  'Stage 02 Test Source',
  'Test Publisher',
  'PDF_DOCUMENT',
  'MANUAL_UPLOAD',
  ARRAY['WSM'],
  ARRAY['ECONOMICS']::pdqe.source_domain[],
  '00000000-0000-0000-0000-000000000001'
);

-- ────────────────────────────────────────────────────────────────────────────
-- T01 — ingestion_events table exists with correct columns
-- ────────────────────────────────────────────────────────────────────────────

SELECT has_table('pdqe', 'ingestion_events', 'T01.1: pdqe.ingestion_events table exists');

SELECT has_column('pdqe', 'ingestion_events', 'ingestion_id',      'T01.2a: ingestion_id column exists');
SELECT has_column('pdqe', 'ingestion_events', 'source_id',         'T01.2b: source_id column exists');
SELECT has_column('pdqe', 'ingestion_events', 'file_name',         'T01.2c: file_name column exists');
SELECT has_column('pdqe', 'ingestion_events', 'file_extension',    'T01.2d: file_extension column exists');
SELECT has_column('pdqe', 'ingestion_events', 'declared_mime_type','T01.2e: declared_mime_type column exists');
SELECT has_column('pdqe', 'ingestion_events', 'file_size_bytes',   'T01.2f: file_size_bytes column exists');
SELECT has_column('pdqe', 'ingestion_events', 'is_scanned_pdf',    'T01.2g: is_scanned_pdf column exists');
SELECT has_column('pdqe', 'ingestion_events', 'layer1_passed',     'T01.2h: layer1_passed column exists');
SELECT has_column('pdqe', 'ingestion_events', 'status',            'T01.2i: status column exists');
SELECT has_column('pdqe', 'ingestion_events', 'content_hash',      'T01.2j: content_hash column exists');
SELECT has_column('pdqe', 'ingestion_events', 'registered_by',     'T01.2k: registered_by column exists');

-- ────────────────────────────────────────────────────────────────────────────
-- T02 — Layer 1 whitelist enforcement
-- ────────────────────────────────────────────────────────────────────────────

-- T02.1-7: all seven whitelisted file types are accepted (layer1_passed = TRUE)
DO $$
DECLARE
  v_src_id UUID;
BEGIN
  SELECT source_id INTO v_src_id FROM pdqe.sources WHERE title = 'Stage 02 Test Source';

  INSERT INTO pdqe.ingestion_events (source_id, file_name, file_extension, registered_by)
  VALUES
    (v_src_id, 'bulletin.pdf',  'pdf',  '00000000-0000-0000-0000-000000000001'),
    (v_src_id, 'data.csv',      'csv',  '00000000-0000-0000-0000-000000000001'),
    (v_src_id, 'data.json',     'json', '00000000-0000-0000-0000-000000000001'),
    (v_src_id, 'workbook.xlsx', 'xlsx', '00000000-0000-0000-0000-000000000001'),
    (v_src_id, 'report.docx',   'docx', '00000000-0000-0000-0000-000000000001'),
    (v_src_id, 'notes.txt',     'txt',  '00000000-0000-0000-0000-000000000001'),
    (v_src_id, 'feed.xml',      'xml',  '00000000-0000-0000-0000-000000000001');
END $$;

SELECT is(
  (SELECT layer1_passed FROM pdqe.ingestion_events WHERE file_name = 'bulletin.pdf'),
  TRUE, 'T02.1: PDF accepted by Layer 1 whitelist'
);
SELECT is(
  (SELECT layer1_passed FROM pdqe.ingestion_events WHERE file_name = 'data.csv'),
  TRUE, 'T02.2: CSV accepted by Layer 1 whitelist'
);
SELECT is(
  (SELECT layer1_passed FROM pdqe.ingestion_events WHERE file_name = 'data.json'),
  TRUE, 'T02.3: JSON accepted by Layer 1 whitelist'
);
SELECT is(
  (SELECT layer1_passed FROM pdqe.ingestion_events WHERE file_name = 'workbook.xlsx'),
  TRUE, 'T02.4: XLSX accepted by Layer 1 whitelist'
);
SELECT is(
  (SELECT layer1_passed FROM pdqe.ingestion_events WHERE file_name = 'report.docx'),
  TRUE, 'T02.5: DOCX accepted by Layer 1 whitelist'
);
SELECT is(
  (SELECT layer1_passed FROM pdqe.ingestion_events WHERE file_name = 'notes.txt'),
  TRUE, 'T02.6: TXT accepted by Layer 1 whitelist'
);
SELECT is(
  (SELECT layer1_passed FROM pdqe.ingestion_events WHERE file_name = 'feed.xml'),
  TRUE, 'T02.7: XML accepted by Layer 1 whitelist'
);

-- T02.8-11: disallowed file type is rejected, recorded, and reasoned
INSERT INTO pdqe.ingestion_events (source_id, file_name, file_extension, registered_by)
VALUES (
  (SELECT source_id FROM pdqe.sources WHERE title = 'Stage 02 Test Source'),
  'malware.exe', 'exe', '00000000-0000-0000-0000-000000000001'
);

SELECT is(
  (SELECT layer1_passed FROM pdqe.ingestion_events WHERE file_name = 'malware.exe'),
  FALSE, 'T02.8: disallowed type (.exe) rejected by Layer 1 whitelist'
);
SELECT is(
  (SELECT status FROM pdqe.ingestion_events WHERE file_name = 'malware.exe'),
  'LAYER1_REJECTED', 'T02.9: rejected upload gets status LAYER1_REJECTED'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pdqe.ingestion_events WHERE file_name = 'malware.exe'),
  'T02.10: rejected upload attempt is still recorded, not discarded'
);
SELECT ok(
  (SELECT rejection_reason FROM pdqe.ingestion_events WHERE file_name = 'malware.exe') IS NOT NULL,
  'T02.11: rejection_reason is populated on Layer 1 rejection'
);

-- T02.12: whitelist check is case-insensitive
INSERT INTO pdqe.ingestion_events (source_id, file_name, file_extension, registered_by)
VALUES (
  (SELECT source_id FROM pdqe.sources WHERE title = 'Stage 02 Test Source'),
  'UPPER.PDF', 'PDF', '00000000-0000-0000-0000-000000000001'
);

SELECT is(
  (SELECT layer1_passed FROM pdqe.ingestion_events WHERE file_name = 'UPPER.PDF'),
  TRUE, 'T02.12: Layer 1 whitelist check is case-insensitive'
);

-- ────────────────────────────────────────────────────────────────────────────
-- T03 — upload_security_log append-only enforcement
-- ────────────────────────────────────────────────────────────────────────────

SELECT has_table('pdqe', 'upload_security_log', 'T03.1: pdqe.upload_security_log table exists');

SELECT pdqe.log_security_check(
  (SELECT ingestion_id FROM pdqe.ingestion_events WHERE file_name = 'bulletin.pdf'),
  'LAYER2_SANITISATION', TRUE, '{"stub": true}', NULL, NULL
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pdqe.upload_security_log
     WHERE ingestion_id = (SELECT ingestion_id FROM pdqe.ingestion_events WHERE file_name = 'bulletin.pdf')
       AND layer = 'LAYER2_SANITISATION'
  ),
  'T03.2: log_security_check() inserts a row successfully'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pdqe.upload_security_log
     WHERE ingestion_id = (SELECT ingestion_id FROM pdqe.ingestion_events WHERE file_name = 'bulletin.pdf')
       AND layer = 'LAYER1_WHITELIST'
       AND passed = TRUE
  ),
  'T03.3: Layer 1 result is auto-logged to upload_security_log on ingestion insert'
);

SELECT throws_ok(
  $$ UPDATE pdqe.upload_security_log SET passed = FALSE WHERE layer = 'LAYER2_SANITISATION' $$,
  'P0001',
  NULL,
  'T03.4: UPDATE on upload_security_log raises exception (append-only trigger)'
);

SELECT throws_ok(
  $$ DELETE FROM pdqe.upload_security_log WHERE layer = 'LAYER2_SANITISATION' $$,
  'P0001',
  NULL,
  'T03.5: DELETE on upload_security_log raises exception (append-only trigger)'
);

SELECT pdqe.log_security_check(
  (SELECT ingestion_id FROM pdqe.ingestion_events WHERE file_name = 'bulletin.pdf'),
  'LAYER3_PROMPT_CONSTRUCTION', TRUE, '{"stub": true}', NULL, NULL
);

SELECT ok(
  (
    SELECT bool_and(a.log_id < b.log_id)
    FROM pdqe.upload_security_log a
    JOIN pdqe.upload_security_log b ON b.log_id = (
      SELECT MIN(c.log_id) FROM pdqe.upload_security_log c WHERE c.log_id > a.log_id
    )
  ),
  'T03.6: log_id is strictly monotonically increasing across all rows'
);

-- ────────────────────────────────────────────────────────────────────────────
-- T04 — RLS policy enforcement per role
-- ────────────────────────────────────────────────────────────────────────────

SELECT ok(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'pdqe' AND tablename = 'ingestion_events'),
  'T04.1: RLS enabled on pdqe.ingestion_events'
);

SELECT ok(
  (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'pdqe' AND tablename = 'upload_security_log'),
  'T04.2: RLS enabled on pdqe.upload_security_log'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'pdqe' AND tablename = 'ingestion_events'
       AND policyname = 'pdqe_admin_all_ingestion_events'
  ), 'T04.3: pdqe_admin_all_ingestion_events policy exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'pdqe' AND tablename = 'ingestion_events'
       AND policyname = 'pdqe_reviewer_read_ingestion_events'
  ), 'T04.4: pdqe_reviewer_read_ingestion_events policy exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'pdqe' AND tablename = 'ingestion_events'
       AND policyname = 'pdqe_provider_own_ingestion_events'
  ), 'T04.5: pdqe_provider_own_ingestion_events policy exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'pdqe' AND tablename = 'ingestion_events'
       AND policyname = 'service_role_all_ingestion_events'
  ), 'T04.6: service_role_all_ingestion_events policy exists'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'pdqe' AND tablename = 'upload_security_log'
       AND cmd = 'UPDATE'
       AND roles && ARRAY['pdqe_admin', 'pdqe_reviewer', 'pdqe_provider', 'pdqe_reader']::NAME[]
  ), 'T04.7: No UPDATE policy on upload_security_log for any pdqe_ role (append-only)'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'pdqe' AND tablename = 'upload_security_log'
       AND cmd = 'DELETE'
       AND roles && ARRAY['pdqe_admin', 'pdqe_reviewer', 'pdqe_provider', 'pdqe_reader']::NAME[]
  ), 'T04.8: No DELETE policy on upload_security_log for any pdqe_ role (append-only)'
);

SELECT has_function('pdqe', 'validate_file_type', ARRAY['text'],
  'T04.9: pdqe.validate_file_type function exists'
);

SELECT ok(
  (
    SELECT p.prosecdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'pdqe' AND p.proname = 'log_security_check'
  ),
  'T04.10: log_security_check is SECURITY DEFINER'
);

-- ────────────────────────────────────────────────────────────────────────────
-- T05 — Stage 01 objects untouched (lightweight regression guard)
-- ────────────────────────────────────────────────────────────────────────────

SELECT has_table('pdqe', 'sources', 'T05.1: pdqe.sources still exists (Stage 01 untouched)');

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'pdqe' AND tablename = 'audit_log'
       AND cmd = 'UPDATE'
       AND roles && ARRAY['pdqe_admin', 'pdqe_reviewer', 'pdqe_provider', 'pdqe_reader']::NAME[]
  ), 'T05.2: pdqe.audit_log still has no UPDATE policy for any pdqe_ role (Stage 01 untouched)'
);

-- ────────────────────────────────────────────────────────────────────────────
-- Finish
-- ────────────────────────────────────────────────────────────────────────────

SELECT * FROM finish();

ROLLBACK;
