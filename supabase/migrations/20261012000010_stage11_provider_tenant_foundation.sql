-- ============================================================================
-- PDQE Stage 11 — PR 1: Provider tenant foundation
--
-- 1. pdqe.sources.internal_pipeline now defaults to FALSE. A row must opt in
--    to the SBP internal bypass explicitly (the dogfood runner already sets
--    internal_pipeline = true on every insert — pipeline_client.py).
-- 2. pdqe.provider_accounts — the tenant anchor for all of Stage 11. One row
--    per external provider auth user; pdqe_provider sees/writes its own row.
-- 3. pdqe.sources.provider_account_id — nullable FK to the tenant. CHECK:
--    an external row (internal_pipeline = false) must name its tenant.
--    Internal rows keep it NULL; existing behaviour is unchanged.
--
-- Depends on: 20261008000001_pdqe_schema_and_roles.sql,
--             20261008000002_pdqe_sources.sql
-- Date: 2026-10-12
--
-- Pre-apply check (2026-10-11, live project): 0 of 38 pdqe.sources rows have
-- internal_pipeline = false, so the new CHECK validates against existing data.
-- Numbered 000010 because 20261012000007 is already taken by
-- pdqe_dogfood_runs; a duplicate version breaks `supabase db push`.
-- ============================================================================

-- ── 1. internal_pipeline default ─────────────────────────────────────────────

ALTER TABLE pdqe.sources ALTER COLUMN internal_pipeline SET DEFAULT FALSE;

COMMENT ON COLUMN pdqe.sources.internal_pipeline IS
  'TRUE = SBP internal bypass; $25 upload fee does not apply (OD-4).
   FALSE (default from Stage 11) = external provider path; requires
   provider_account_id (sources_external_requires_provider_account).
   Internal callers must set TRUE explicitly.';

-- ── 2. pdqe.provider_accounts ────────────────────────────────────────────────

CREATE TABLE pdqe.provider_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NOT NULL + UNIQUE: the own-row RLS policies key on auth_user_id, so a
  -- NULL or duplicated owner would leave a row unreachable or shared.
  auth_user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  provider_id      UUID REFERENCES public.providers(id),
  verified_wallet  TEXT NOT NULL
                   CHECK (verified_wallet ~ '^[A-Z2-7]{58}$'),  -- Algorand address
  plan             TEXT NOT NULL DEFAULT 'standard'
                   CHECK (char_length(trim(plan)) >= 1),
  created_at       TIMESTAMPTZ DEFAULT now(),
  is_active        BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_pdqe_provider_accounts_provider_id
  ON pdqe.provider_accounts (provider_id)
  WHERE provider_id IS NOT NULL;

COMMENT ON TABLE pdqe.provider_accounts IS
  'Stage 11 tenant anchor. One row per external provider auth user.
   Every external pdqe.sources row (internal_pipeline = false) references
   one of these via provider_account_id.';

COMMENT ON COLUMN pdqe.provider_accounts.verified_wallet IS
  'Provider''s own Algorand wallet. Payments settle here directly — SBP never
   holds funds (P2). Format-checked only; ownership verification is upstream.';

ALTER TABLE pdqe.provider_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdqe_admin_all_provider_accounts"
  ON pdqe.provider_accounts FOR ALL TO pdqe_admin
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_provider_accounts"
  ON pdqe.provider_accounts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- pdqe_provider: own row only. pdqe_provider holds EXECUTE on auth.uid()
-- (checked live 2026-10-11); policies bind it by OID, so no auth schema
-- USAGE grant is needed.
CREATE POLICY "pdqe_provider_read_own_account"
  ON pdqe.provider_accounts FOR SELECT TO pdqe_provider
  USING (auth_user_id = auth.uid());

-- Self-registration may only create a standard, active account for itself;
-- plan and is_active are SBP-controlled after that (see column grants below).
CREATE POLICY "pdqe_provider_insert_own_account"
  ON pdqe.provider_accounts FOR INSERT TO pdqe_provider
  WITH CHECK (
    auth_user_id = auth.uid()
    AND plan = 'standard'
    AND is_active IS TRUE
  );

CREATE POLICY "pdqe_provider_update_own_account"
  ON pdqe.provider_accounts FOR UPDATE TO pdqe_provider
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- No DELETE for pdqe_provider: deactivation is is_active = false by SBP,
-- so the tenant's source history stays attributable (P7).

GRANT SELECT, INSERT, UPDATE, DELETE ON pdqe.provider_accounts TO pdqe_admin;
GRANT ALL ON pdqe.provider_accounts TO service_role;
GRANT SELECT ON pdqe.provider_accounts TO pdqe_provider;
-- provider_id is not self-assignable: SBP links the PDC provider listing after
-- Bronze identity verification, so an account cannot claim another
-- institution's listing.
GRANT INSERT (auth_user_id, verified_wallet, plan, is_active)
  ON pdqe.provider_accounts TO pdqe_provider;
-- Column-level: a provider can rotate its own wallet but cannot change its
-- owner, plan, activation state, or PDC provider link.
GRANT UPDATE (verified_wallet) ON pdqe.provider_accounts TO pdqe_provider;

-- ── 3. pdqe.sources.provider_account_id ──────────────────────────────────────

ALTER TABLE pdqe.sources
  ADD COLUMN provider_account_id UUID REFERENCES pdqe.provider_accounts(id);

CREATE INDEX idx_pdqe_sources_provider_account_id
  ON pdqe.sources (provider_account_id)
  WHERE provider_account_id IS NOT NULL;

ALTER TABLE pdqe.sources
  ADD CONSTRAINT sources_external_requires_provider_account
  CHECK (internal_pipeline = true OR provider_account_id IS NOT NULL);

COMMENT ON COLUMN pdqe.sources.provider_account_id IS
  'Stage 11 tenant. Required when internal_pipeline = false; NULL for SBP
   internal pipeline rows.';
