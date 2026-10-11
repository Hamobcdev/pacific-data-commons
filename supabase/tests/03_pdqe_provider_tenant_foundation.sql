-- ============================================================================
-- PDQE Stage 11 (1/N) — pgTAP Test Suite
-- 03_pdqe_provider_tenant_foundation.sql
--
-- Tests:
--   T01 — internal_pipeline default and provider_account_id column
--   T02 — sources_external_requires_provider_account CHECK
--   T03 — pdqe.provider_accounts constraints
--   T04 — pdqe.provider_accounts RLS: pdqe_provider sees/writes own row only
--
-- Run with: supabase test db (local stack)
-- Depends on: migrations through 20261012000010
-- Date: 2026-10-12
-- ============================================================================

BEGIN;

SELECT plan(22);

-- ────────────────────────────────────────────────────────────────────────────
-- HELPERS
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  INSERT INTO auth.users (id, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, role)
  VALUES
    ('00000000-0000-0000-0000-000000001101', 'pdqe-s11-a@sbp.test', now(), now(), '{}', '{}', false, 'authenticated'),
    ('00000000-0000-0000-0000-000000001102', 'pdqe-s11-b@sbp.test', now(), now(), '{}', '{}', false, 'authenticated'),
    ('00000000-0000-0000-0000-000000001103', 'pdqe-s11-c@sbp.test', now(), now(), '{}', '{}', false, 'authenticated')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Provider A and B accounts (service_role path)
INSERT INTO pdqe.provider_accounts (id, auth_user_id, verified_wallet) VALUES
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-000000001101', repeat('A', 58)),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-000000001102', repeat('B', 58));

-- ────────────────────────────────────────────────────────────────────────────
-- T01 — Column defaults
-- ────────────────────────────────────────────────────────────────────────────

SELECT col_default_is('pdqe', 'sources', 'internal_pipeline', 'false',
  'T01.1: internal_pipeline defaults to FALSE');
SELECT has_column('pdqe', 'sources', 'provider_account_id',
  'T01.2: sources.provider_account_id exists');
SELECT col_is_null('pdqe', 'sources', 'provider_account_id',
  'T01.3: provider_account_id is nullable');
SELECT fk_ok('pdqe', 'sources', 'provider_account_id', 'pdqe', 'provider_accounts', 'id',
  'T01.4: provider_account_id references pdqe.provider_accounts(id)');

-- ────────────────────────────────────────────────────────────────────────────
-- T02 — External rows require a tenant; internal path unchanged
-- ────────────────────────────────────────────────────────────────────────────

SELECT throws_ok(
  $$
    INSERT INTO pdqe.sources (
      internal_pipeline, title, publisher_name, source_type, acquisition_method, registered_by
    ) VALUES (
      FALSE, 'External Without Tenant', 'Test Publisher', 'PDF_DOCUMENT', 'MANUAL_UPLOAD',
      '00000000-0000-0000-0000-000000001101'
    )
  $$,
  '23514', NULL,
  'T02.1: internal_pipeline=false without provider_account_id is rejected'
);

SELECT throws_ok(
  $$
    INSERT INTO pdqe.sources (
      title, publisher_name, source_type, acquisition_method, registered_by
    ) VALUES (
      'Defaulted External Without Tenant', 'Test Publisher', 'PDF_DOCUMENT', 'MANUAL_UPLOAD',
      '00000000-0000-0000-0000-000000001101'
    )
  $$,
  '23514', NULL,
  'T02.2: omitting internal_pipeline now defaults to external and is rejected without a tenant'
);

SELECT lives_ok(
  $$
    INSERT INTO pdqe.sources (
      internal_pipeline, title, publisher_name, source_type, acquisition_method, registered_by
    ) VALUES (
      TRUE, 'Internal Without Tenant', 'SBP', 'PDF_DOCUMENT', 'MANUAL_UPLOAD',
      '00000000-0000-0000-0000-000000001101'
    )
  $$,
  'T02.3: internal_pipeline=true without provider_account_id is allowed'
);

SELECT lives_ok(
  $$
    INSERT INTO pdqe.sources (
      internal_pipeline, provider_account_id, title, publisher_name, source_type,
      acquisition_method, registered_by
    ) VALUES (
      FALSE, '00000000-0000-0000-0000-00000000a001', 'External With Tenant', 'Provider A',
      'PDF_DOCUMENT', 'DIRECT_PROVISION', '00000000-0000-0000-0000-000000001101'
    )
  $$,
  'T02.4: internal_pipeline=false with provider_account_id is allowed'
);

SELECT throws_ok(
  $$
    UPDATE pdqe.sources SET provider_account_id = NULL
     WHERE title = 'External With Tenant'
  $$,
  '23514', NULL,
  'T02.5: clearing the tenant on an external row is rejected'
);

SELECT throws_ok(
  $$
    UPDATE pdqe.sources SET internal_pipeline = FALSE
     WHERE title = 'Internal Without Tenant'
  $$,
  '23514', NULL,
  'T02.6: flipping an internal row to external without a tenant is rejected'
);

SELECT throws_ok(
  $$
    INSERT INTO pdqe.sources (
      internal_pipeline, provider_account_id, title, publisher_name, source_type,
      acquisition_method, registered_by
    ) VALUES (
      FALSE, '00000000-0000-0000-0000-0000000dead0', 'External Bad Tenant', 'Nobody',
      'PDF_DOCUMENT', 'DIRECT_PROVISION', '00000000-0000-0000-0000-000000001101'
    )
  $$,
  '23503', NULL,
  'T02.7: provider_account_id must reference an existing account'
);

-- ────────────────────────────────────────────────────────────────────────────
-- T03 — provider_accounts constraints
-- ────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT plan FROM pdqe.provider_accounts WHERE id = '00000000-0000-0000-0000-00000000a001'),
  'standard',
  'T03.1: plan defaults to standard'
);

SELECT throws_ok(
  $$
    INSERT INTO pdqe.provider_accounts (auth_user_id, verified_wallet)
    VALUES ('00000000-0000-0000-0000-000000001101', repeat('C', 58))
  $$,
  '23505', NULL,
  'T03.2: one provider account per auth user'
);

SELECT throws_ok(
  $$
    INSERT INTO pdqe.provider_accounts (auth_user_id, verified_wallet)
    VALUES ('00000000-0000-0000-0000-000000001103', 'not-an-algorand-address')
  $$,
  '23514', NULL,
  'T03.3: verified_wallet must be an Algorand address'
);

-- ────────────────────────────────────────────────────────────────────────────
-- T04 — RLS as pdqe_provider (acting as provider A)
-- ────────────────────────────────────────────────────────────────────────────

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'pdqe.provider_accounts'::regclass),
  'T04.1: RLS enabled on pdqe.provider_accounts'
);

SET LOCAL ROLE pdqe_provider;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000001101","role":"pdqe_provider"}', true);

SELECT is(
  (SELECT array_agg(id::TEXT) FROM pdqe.provider_accounts),
  ARRAY['00000000-0000-0000-0000-00000000a001'],
  'T04.2: provider sees only its own account'
);

SELECT lives_ok(
  $$ UPDATE pdqe.provider_accounts SET verified_wallet = repeat('D', 58)
      WHERE id = '00000000-0000-0000-0000-00000000a001' $$,
  'T04.3: provider can rotate its own wallet'
);

UPDATE pdqe.provider_accounts SET verified_wallet = repeat('E', 58)
 WHERE id = '00000000-0000-0000-0000-00000000b001';

SELECT throws_ok(
  $$ UPDATE pdqe.provider_accounts SET plan = 'enterprise'
      WHERE id = '00000000-0000-0000-0000-00000000a001' $$,
  '42501', NULL,
  'T04.4: provider cannot change its own plan'
);

SELECT throws_ok(
  $$ INSERT INTO pdqe.provider_accounts (auth_user_id, verified_wallet)
     VALUES ('00000000-0000-0000-0000-000000001103', repeat('F', 58)) $$,
  '42501', NULL,
  'T04.5: provider cannot create an account for another user'
);

SELECT throws_ok(
  $$ UPDATE pdqe.provider_accounts SET provider_id = gen_random_uuid()
      WHERE id = '00000000-0000-0000-0000-00000000a001' $$,
  '42501', NULL,
  'T04.6: provider cannot link itself to a PDC provider listing'
);

SELECT throws_ok(
  $$ DELETE FROM pdqe.provider_accounts
      WHERE id = '00000000-0000-0000-0000-00000000a001' $$,
  '42501', NULL,
  'T04.7: provider cannot delete its account'
);

RESET ROLE;

SELECT is(
  (SELECT verified_wallet FROM pdqe.provider_accounts WHERE id = '00000000-0000-0000-0000-00000000b001'),
  repeat('B', 58),
  'T04.8: provider A''s update did not touch provider B''s row'
);

SELECT * FROM finish();
ROLLBACK;
