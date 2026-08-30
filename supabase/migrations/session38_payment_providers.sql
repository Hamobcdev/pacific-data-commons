-- ============================================================================
-- Session 38 — CBS Type 3 escrow architecture stub (Deliverable 3A)
-- Authority: CLAUDE.md v2.2, Section 4 (P2 — SBP never holds funds) and the
-- Session 38 build prompt.
--
-- payment_providers is the registry of every monetary-authority-adjacent
-- institution in the SBP ecosystem: the Central Bank of Samoa (Type 3
-- escrow custodian), licensed commercial banks, mobile money providers,
-- the USDC issuer, Algorand infrastructure, and donor grant wallets. Every
-- row here is seeded as 'stub' except the two Algorand node providers
-- already live in production (see session1_migration.sql's ALGORAND_NODE_URL
-- / AlgoNode-fallback pattern, also documented in CLAUDE.md Section 6 —
-- "Never single node in production").
--
-- No provider, buyer, or public RLS policy exists on this table on purpose
-- — same posture as compliance_checks.sql in this session. A ministry or
-- commercial provider never queries this table directly; it exists for
-- SBP-internal financial-rails bookkeeping and the future CBS read-only
-- dashboard (Session 39).
-- ============================================================================

CREATE TABLE payment_providers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id           TEXT UNIQUE NOT NULL,
  provider_name         TEXT NOT NULL,
  provider_type         TEXT NOT NULL CHECK (provider_type IN (
    'central_bank',
    'commercial_bank',
    'mobile_money',
    'stablecoin_issuer',
    'algorand_node',
    'crypto_exchange',
    'donor_fund'
  )),
  jurisdiction          TEXT[],
  currencies_supported  TEXT[],
  status                TEXT NOT NULL DEFAULT 'stub'
                        CHECK (status IN ('stub', 'active', 'suspended', 'decommissioned')),
  api_endpoint          TEXT,
  api_key_env_var       TEXT,
  connection_type       TEXT CHECK (connection_type IN (
    'rest_api', 'webhook', 'direct_db', 'algorand_wallet', 'manual'
  )),
  cbs_approved          BOOLEAN DEFAULT FALSE,
  cbs_approval_date     TIMESTAMP WITH TIME ZONE,
  regulatory_reference  TEXT,
  stub_reason           TEXT,
  activated_at          TIMESTAMP WITH TIME ZONE,
  notes                 TEXT,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE payment_providers ENABLE ROW LEVEL SECURITY;
-- Service role only — no public or provider access

-- Seed the known providers as stubs
INSERT INTO payment_providers (provider_id, provider_name, provider_type,
  jurisdiction, currencies_supported, status, stub_reason) VALUES
('cbs-samoa', 'Central Bank of Samoa', 'central_bank',
  ARRAY['WS'], ARRAY['WST','USDC'], 'stub',
  'Type 3 escrow custodian — activates when CBS H1 regulatory position confirmed'),
('bsp-pacific', 'Bank of South Pacific', 'commercial_bank',
  ARRAY['PG','FJ','SB','VU','WS','TO'], ARRAY['PGK','FJD','SBD','VUV','WST'],
  'stub', 'Tier 2 on-ramp candidate — activates under CBS approval'),
('anz-pacific', 'ANZ Pacific', 'commercial_bank',
  ARRAY['FJ','PG','SB','VU','WS','TO'], ARRAY['FJD','PGK','SBD','VUV','WST'],
  'stub', 'Commercial bank integration — activates under CBS approval'),
('westpac-pacific', 'Westpac Pacific', 'commercial_bank',
  ARRAY['FJ','PG','SB','WS'], ARRAY['FJD','PGK','SBD','WST'],
  'stub', 'Commercial bank integration — activates under CBS approval'),
('mpaisa-samoa', 'Vodafone M-PAiSA Samoa', 'mobile_money',
  ARRAY['WS'], ARRAY['WST'], 'stub',
  'Tier 1 mobile money on-ramp — activates Phase 2 under CBS approval'),
('mpaisa-fiji', 'Vodafone M-PAiSA Fiji', 'mobile_money',
  ARRAY['FJ'], ARRAY['FJD'], 'stub',
  'Tier 1 mobile money on-ramp — activates Phase 2 under Reserve Bank of Fiji approval'),
('circle-usdc', 'Circle (USDC Issuer)', 'stablecoin_issuer',
  ARRAY['US'], ARRAY['USDC'], 'stub',
  'USDC reserve attestation — connects when CBS reserve position formalised'),
('nodely-algorand', 'Nodely Algorand Node', 'algorand_node',
  ARRAY['GLOBAL'], ARRAY['ALGO','USDC'], 'active',
  NULL),
('algonode-fallback', 'AlgoNode Fallback', 'algorand_node',
  ARRAY['GLOBAL'], ARRAY['ALGO','USDC'], 'active',
  NULL),
('adb-donor-fund', 'Asian Development Bank Grant Wallet', 'donor_fund',
  ARRAY['REGIONAL'], ARRAY['USDC','USD'], 'stub',
  'ADB programme grant wallet — activates when ADB grant programme formalised'),
('dfat-donor-fund', 'DFAT Pacific Skills Initiative', 'donor_fund',
  ARRAY['REGIONAL'], ARRAY['USDC','AUD'], 'stub',
  'DFAT grant wallet for PEC — activates when Pacific Skills Initiative grant confirmed'),
('world-bank-donor', 'World Bank Pacific Digital Economy', 'donor_fund',
  ARRAY['REGIONAL'], ARRAY['USDC','USD'], 'stub',
  'World Bank grant wallet — activates when Pacific Digital Economy programme confirmed');

-- ── VERIFICATION QUERIES ────────────────────────────────────────
-- Run after applying this migration to confirm correctness.

-- Confirm table exists with 12 seeded rows
-- SELECT count(*) FROM payment_providers;
-- Expected: 12

-- Confirm RLS enabled
-- SELECT rowsecurity FROM pg_tables WHERE tablename = 'payment_providers';
-- Expected: true

-- Confirm no public/authenticated policy exists (service-role-only by design)
-- SELECT policyname FROM pg_policies WHERE tablename = 'payment_providers';
-- Expected: zero rows

-- Confirm exactly 2 providers are 'active' (the two live Algorand nodes)
-- SELECT provider_id FROM payment_providers WHERE status = 'active';
-- Expected: nodely-algorand, algonode-fallback
