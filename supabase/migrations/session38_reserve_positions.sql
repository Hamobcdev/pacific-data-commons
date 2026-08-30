-- ============================================================================
-- Session 38 — CBS Type 3 escrow architecture stub (Deliverable 3B)
-- Authority: CLAUDE.md v2.2, Section 4 (P2 — SBP never holds funds) and the
-- Session 38 build prompt.
--
-- reserve_positions records what each payment_providers row is holding on
-- the ecosystem's behalf — USDC in custody, fiat reserves, donor grant
-- wallet balances, escrow, or exchange-pending amounts. No rows are seeded
-- by this migration: the Type 3 escrow model (CBS as custodian) has not
-- activated yet (H1 — CBS written regulatory position required), so there
-- is nothing real to record. GET /compliance/escrow/summary in
-- apps/directory-api reads this table and reports zeroed stub totals until
-- rows exist.
--
-- No provider, buyer, or public RLS policy exists on this table under any
-- circumstance — same posture as compliance_checks.sql and
-- payment_providers.sql in this session. A dedicated CBS read-only role
-- is Session 39 work.
-- ============================================================================

CREATE TABLE reserve_positions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id           TEXT NOT NULL REFERENCES payment_providers(provider_id),
  position_type         TEXT NOT NULL CHECK (position_type IN (
    'usdc_custodial',
    'fiat_reserve',
    'donor_grant_wallet',
    'escrow_held',
    'exchange_pending'
  )),
  platform_node         TEXT,
  currency              TEXT NOT NULL,
  amount                NUMERIC NOT NULL DEFAULT 0,
  amount_usdc_equivalent NUMERIC,
  exchange_rate         NUMERIC,
  exchange_rate_source  TEXT,
  exchange_rate_at      TIMESTAMP WITH TIME ZONE,
  status                TEXT NOT NULL DEFAULT 'stub'
                        CHECK (status IN (
                          'stub', 'live', 'pending', 'frozen', 'reconciling'
                        )),
  cbs_verified          BOOLEAN DEFAULT FALSE,
  cbs_last_verified_at  TIMESTAMP WITH TIME ZONE,
  notes                 TEXT,
  recorded_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  recorded_by           TEXT DEFAULT 'sbp-financial-rails-stub-v1'
);

ALTER TABLE reserve_positions ENABLE ROW LEVEL SECURITY;
-- Service role only. CBS dashboard reads via dedicated role (Session 39).
-- No provider, buyer, or public access under any circumstances.

CREATE INDEX idx_reserve_positions_provider ON reserve_positions(provider_id);
CREATE INDEX idx_reserve_positions_type ON reserve_positions(position_type);
CREATE INDEX idx_reserve_positions_status ON reserve_positions(status);

-- ── VERIFICATION QUERIES ────────────────────────────────────────
-- Run after applying this migration to confirm correctness.

-- Confirm table exists
-- SELECT tablename FROM pg_tables WHERE tablename = 'reserve_positions';

-- Confirm RLS enabled
-- SELECT rowsecurity FROM pg_tables WHERE tablename = 'reserve_positions';
-- Expected: true

-- Confirm no public/authenticated policy exists (service-role-only by design)
-- SELECT policyname FROM pg_policies WHERE tablename = 'reserve_positions';
-- Expected: zero rows

-- Confirm the FK to payment_providers.provider_id is enforced
-- SELECT conname FROM pg_constraint WHERE conrelid = 'reserve_positions'::regclass AND contype = 'f';
