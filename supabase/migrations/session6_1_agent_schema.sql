-- ============================================================================
-- Pacific Data Commons — Session 6.1 Migration
-- Agent infrastructure schema additions
-- Authority: CLAUDE.md v2.2, Decisions 32-38, Part 6 §A
--
-- Standalone migration — does not modify session1_migration.sql or
-- session2_rls_fix.sql in place, per Session 6.1 orientation (R3).
--
-- Deviations from the Session 6.1 prompt draft, both discovered while
-- reconciling this file against session1_migration.sql (read first, per R3):
--   1. agent_run_endpoints gets UNIQUE (agent_id, run_id) — the prompt's
--      duplicate-run_id check was described as an application-layer check
--      only. Every other anti-gaming table in session1 (community_ratings,
--      dispute_flags) backs its application check with a DB-level UNIQUE
--      constraint too; the attribution endpoint gets the same defense
--      against a race between the app-layer check and the insert.
--   2. ogip_jurisdictions territory seed: three of the seven territory codes
--      (CK, NU, WF) already exist as jurisdiction_type='nation' rows from
--      session1_migration.sql's seed data. The prompt's
--      `ON CONFLICT (code) DO NOTHING` would silently skip re-classifying
--      them as 'territory' with a sovereignty_profile — those three rows
--      would keep stale type/profile data. Changed to
--      `ON CONFLICT (code) DO UPDATE` so all seven rows land correctly
--      whether they're new inserts (TK, PF, NC, AS) or reclassifications
--      of existing rows (CK, NU, WF).
--   3. sovereignty_profile and treaty_capacity get CHECK constraints (the
--      prompt only documented the allowed values in a comment) — every
--      other enum-shaped TEXT column in session1_migration.sql is
--      constrained this way; leaving these two unconstrained would be the
--      only exception in the schema.
-- ============================================================================

-- ── 1. AGENT REGISTRY ──────────────────────────────────────
-- Registered agents (first-party and third-party)
CREATE TABLE agents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name              TEXT NOT NULL,
  agent_type              TEXT NOT NULL CHECK (agent_type IN (
                            'trade_intelligence',
                            'climate_risk',
                            'fisheries_status',
                            'agricultural_exports',
                            'remittance_navigator',
                            'grant_matcher',
                            'third_party'
                          )),
  developer_id            UUID REFERENCES providers(id),
  -- NULL for SBP first-party agents

  -- Operational wallet (DIFFERENT from developer's payTo wallet)
  -- This wallet PAYS endpoint queries — it is the buyer wallet
  -- NOT the wallet that receives commission payments
  operational_wallet      TEXT NOT NULL,

  -- Verification tier
  verification_tier       TEXT NOT NULL DEFAULT 'unverified'
                          CHECK (verification_tier IN (
                            'unverified',
                            'verified',
                            'certified'
                          )),

  -- Sovereignty compliance
  -- Agents must respect these flags on every endpoint they query
  respects_indigenous_flag  BOOLEAN NOT NULL DEFAULT TRUE,
  respects_cultural_sensitivity BOOLEAN NOT NULL DEFAULT TRUE,
  -- An agent that sets either to FALSE is ineligible for verification

  -- Commission model (Decision 32 — invoice not split contract)
  -- 100% of user payment settles to developer wallet
  -- SBP 12% invoiced monthly above $10 threshold
  commission_pct          DECIMAL DEFAULT 12.00,
  commission_accrued_usdc DECIMAL DEFAULT 0,
  commission_threshold    DECIMAL DEFAULT 10.00,
  last_commission_settled TIMESTAMP WITH TIME ZONE,

  -- Status
  is_active               BOOLEAN DEFAULT FALSE,
  listed_at               TIMESTAMP WITH TIME ZONE,
  suspended_at            TIMESTAMP WITH TIME ZONE,
  suspension_reason       TEXT,

  -- Metadata
  description             TEXT,
  skills_file_url         TEXT,
  version                 TEXT DEFAULT '1.0',

  created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 2. AGENT RUN ENDPOINTS ─────────────────────────────────
-- Attribution records — wallet-signed per run (Decision 37)
-- Every agent run must submit this record
-- Compliance monitor reconciles against on-chain payments nightly
CREATE TABLE agent_run_endpoints (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                      TEXT NOT NULL,
  -- Client-generated UUID for the run — agent provides this
  agent_id                    UUID NOT NULL REFERENCES agents(id),

  -- The endpoints queried in this run
  endpoint_tx_ids             TEXT[] NOT NULL DEFAULT '{}',
  -- Algorand transaction IDs proving the agent paid for these queries

  -- Originating user identity (hashed for privacy — not raw wallet)
  originating_user_wallet_hash TEXT NOT NULL,
  -- SHA-256 of originating user's Algorand address
  -- Used for Silver rating eligibility and self-dealing detection
  -- Never stores the raw wallet address

  -- Attribution status
  attribution_status          TEXT NOT NULL DEFAULT 'pending'
                              CHECK (attribution_status IN (
                                'pending',
                                -- Submitted, not yet reconciled
                                'verified',
                                -- On-chain payments confirmed
                                'unmatched',
                                -- Payments found but attribution incomplete
                                'compliance_flagged'
                                -- Too many unmatched payments
                              )),

  -- Wallet signature proof (Decision 37)
  signed_by                   TEXT NOT NULL,
  -- The agent's registered operational_wallet address
  signature                   TEXT NOT NULL,
  -- Base64 Ed25519 signature of the attribution payload

  -- Reconciliation
  reconciled_at               TIMESTAMP WITH TIME ZONE,
  reconciliation_notes        TEXT,

  submitted_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- One attribution record per agent per run — see deviation note (1) above
  UNIQUE (agent_id, run_id)
);

-- Index for nightly reconciliation job
CREATE INDEX idx_agent_run_pending ON agent_run_endpoints(attribution_status)
  WHERE attribution_status = 'pending';
CREATE INDEX idx_agent_run_agent ON agent_run_endpoints(agent_id, submitted_at DESC);

-- ── 3. USED NONCES ─────────────────────────────────────────
-- Replay prevention for attribution submissions
-- TTL cleanup job removes entries older than 24 hours
CREATE TABLE used_nonces (
  wallet                  TEXT NOT NULL,
  nonce                   TEXT NOT NULL,
  seen_at                 TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (wallet, nonce)
);

CREATE INDEX idx_nonces_seen_at ON used_nonces(seen_at);
-- Cleanup: DELETE FROM used_nonces WHERE seen_at < NOW() - INTERVAL '24 hours'
-- Run as a Supabase scheduled function or Railway cron

-- ── 4. WALLET LINKS ────────────────────────────────────────
-- Maps Algorand wallet addresses to registered entities
-- Used for self-dealing detection and Silver rating eligibility
-- A wallet that belongs to a provider entity cannot rate that entity's endpoints
CREATE TABLE wallet_links (
  wallet_address          TEXT NOT NULL,
  entity_type             TEXT NOT NULL CHECK (entity_type IN (
                            'provider',
                            'agent_operational',
                            'agent_developer',
                            'buyer'
                          )),
  entity_id               UUID NOT NULL,
  -- References providers.id for provider/agent_developer
  -- References agents.id for agent_operational
  verified_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (wallet_address, entity_type)
);

CREATE INDEX idx_wallet_links_entity ON wallet_links(entity_id, entity_type);

-- ── 5. AGENT COMPLIANCE EVENTS ─────────────────────────────
-- Compliance strikes and resolution tracking
CREATE TABLE agent_compliance_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                UUID NOT NULL REFERENCES agents(id),
  kind                    TEXT NOT NULL CHECK (kind IN (
                            'notice',
                            'suspension',
                            'critical',
                            'resolved'
                          )),
  basis                   TEXT NOT NULL,
  -- Human-readable reason
  evidence                JSONB,
  -- Supporting data (unmatched tx IDs, etc.)
  resolved_at             TIMESTAMP WITH TIME ZONE,
  resolution_note         TEXT,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_compliance_agent ON agent_compliance_events(agent_id, created_at DESC);

-- ── 6. SEASONAL CONTEXTS ───────────────────────────────────
-- Seasonal awareness data for Fisheries and Agricultural agents
-- Content populated from PNA/SPC public documents + expert review
-- Schema built now, content added by SBP before agent deployment
CREATE TABLE seasonal_contexts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geography_scope         TEXT NOT NULL,
  -- e.g. 'samoa_eez', 'pacific_wide', 'tonga_eez'
  domain                  TEXT NOT NULL CHECK (domain IN (
                            'fisheries',
                            'agriculture',
                            'climate'
                          )),
  season_label            TEXT NOT NULL,
  -- e.g. 'Q1_jan_mar', 'cyclone_season', 'harvest_coconut'
  month_start             INTEGER NOT NULL CHECK (month_start BETWEEN 1 AND 12),
  month_end               INTEGER NOT NULL CHECK (month_end BETWEEN 1 AND 12),
  context_notes           TEXT NOT NULL,
  -- Plain language description agents inject into synthesis prompts
  -- e.g. "La Niña conditions typically shift skipjack deeper in Q1"
  data_sources            TEXT[],
  -- Public sources this context is drawn from
  reviewed_by              TEXT,
  -- Expert reviewer name/institution
  reviewed_at             TIMESTAMP WITH TIME ZONE,
  version                 INTEGER NOT NULL DEFAULT 1,

  UNIQUE (geography_scope, domain, season_label, version)
);

-- ── 7. OGIP JURISDICTION TYPE EXTENSION ────────────────────
-- Add 'territory' to the jurisdiction_type enum
-- For non-self-governing territories (Tokelau), freely associated
-- states (Cook Islands, Niue), overseas collectivities (French Polynesia)
ALTER TABLE ogip_jurisdictions
  DROP CONSTRAINT IF EXISTS ogip_jurisdictions_jurisdiction_type_check;

ALTER TABLE ogip_jurisdictions
  ADD CONSTRAINT ogip_jurisdictions_jurisdiction_type_check
  CHECK (jurisdiction_type IN (
    'nation',
    'regional',
    'intergovernmental',
    'territory'
    -- territory: includes non-self-governing territories, freely
    -- associated states, and overseas collectivities
    -- Each has a different sovereignty profile — see sovereignty_profile
  ));

-- Add sovereignty profile fields
ALTER TABLE ogip_jurisdictions
  ADD COLUMN IF NOT EXISTS sovereignty_profile    TEXT CHECK (sovereignty_profile IN (
                            'non_self_governing',
                            'freely_associated',
                            'overseas_collectivity',
                            'independent_nation',
                            'regional_body',
                            'intergovernmental_body'
                          )),
  ADD COLUMN IF NOT EXISTS administering_state    TEXT,
  -- ISO 3166-1 alpha-2 of administering state (e.g. 'NZ' for Tokelau)
  -- NULL for independent nations and regional bodies
  ADD COLUMN IF NOT EXISTS un_c24_listed          BOOLEAN DEFAULT FALSE,
  -- TRUE if listed on UN C-24 (Special Committee on Decolonisation)
  -- Tokelau: TRUE. Cook Islands/Niue: FALSE (freely associated)
  ADD COLUMN IF NOT EXISTS treaty_capacity        TEXT DEFAULT 'limited'
                            CHECK (treaty_capacity IN ('full', 'limited', 'none')),
  -- Reflects whether the territory has capacity to enter international treaties
  ADD COLUMN IF NOT EXISTS self_description       TEXT,
  -- Community-provided characterisation of their own sovereignty status
  -- Initially NULL — populated only when the community provides input
  -- Platform never pre-fills this; only the community can set it
  ADD COLUMN IF NOT EXISTS profile_basis_refs     JSONB,
  -- References to primary sources for the sovereignty_profile
  -- e.g. {"un_c24": "https://...", "constitutional_basis": "..."}
  ADD COLUMN IF NOT EXISTS profile_reviewed_at    TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS profile_reviewed_by    TEXT;

-- Seed / reclassify territory entries
-- NOTE: Using UN's own characterisations as initial values
-- self_description is NULL until communities provide their own
-- CK, NU, WF already exist as jurisdiction_type='nation' rows from
-- session1_migration.sql's seed — DO UPDATE reclassifies them here
-- rather than silently skipping (see deviation note (2) at the top)
INSERT INTO ogip_jurisdictions
  (code, name, jurisdiction_type, sovereignty_profile,
   administering_state, un_c24_listed, treaty_capacity,
   profile_basis_refs, ogip_active)
VALUES
  ('TK', 'Tokelau',
   'territory', 'non_self_governing',
   'NZ', TRUE, 'limited',
   '{"basis": "UN General Assembly resolution 1514 (XV)", "c24_list": "https://www.un.org/dppa/decolonization/en/nsgt/tokelau"}',
   FALSE),
  ('PF', 'French Polynesia',
   'territory', 'overseas_collectivity',
   'FR', FALSE, 'limited',
   '{"basis": "French Constitution Article 74", "note": "Significant internal autonomy under 2004 Organic Law"}',
   FALSE),
  ('NC', 'New Caledonia',
   'territory', 'non_self_governing',
   'FR', TRUE, 'limited',
   '{"basis": "UN General Assembly, C-24 list", "note": "Noumea Accord framework"}',
   FALSE),
  ('WF', 'Wallis and Futuna',
   'territory', 'overseas_collectivity',
   'FR', FALSE, 'none',
   '{"basis": "French law 61-814 of 29 July 1961"}',
   FALSE),
  ('CK', 'Cook Islands',
   'territory', 'freely_associated',
   'NZ', FALSE, 'full',
   '{"basis": "Cook Islands Constitution Amendment Act 1965", "note": "Full treaty capacity, self-governing in free association"}',
   FALSE),
  ('NU', 'Niue',
   'territory', 'freely_associated',
   'NZ', FALSE, 'full',
   '{"basis": "Niue Constitution Act 1974", "note": "Self-governing in free association with New Zealand"}',
   FALSE),
  ('AS', 'American Samoa',
   'territory', 'non_self_governing',
   'US', TRUE, 'none',
   '{"basis": "UN C-24 list", "note": "Unincorporated territory of the United States"}',
   FALSE)
ON CONFLICT (code) DO UPDATE SET
  jurisdiction_type    = EXCLUDED.jurisdiction_type,
  sovereignty_profile  = EXCLUDED.sovereignty_profile,
  administering_state  = EXCLUDED.administering_state,
  un_c24_listed        = EXCLUDED.un_c24_listed,
  treaty_capacity      = EXCLUDED.treaty_capacity,
  profile_basis_refs   = EXCLUDED.profile_basis_refs;

-- ── 8. PROVIDERS TABLE ADDITIONS ───────────────────────────
-- Bidirectional wallet support (Part 6 §1A)
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS agent_spend_usdc  DECIMAL DEFAULT 0;
  -- Running total of USDC spent on agent queries from this provider's wallet
  -- Displayed on dashboard alongside total_revenue_usdc to show circular economy
  -- Updated by the agent marketplace service when a provider uses an agent

-- ── 9. ENDPOINTS TABLE ADDITIONS ───────────────────────────
-- Agent caching policy (Decision 34)
ALTER TABLE endpoints
  ADD COLUMN IF NOT EXISTS cache_ttl_seconds    INTEGER DEFAULT 86400,
  -- 86400 = 24 hours default for static data
  ADD COLUMN IF NOT EXISTS agent_reuse_policy   TEXT DEFAULT 'ttl_cache'
    CHECK (agent_reuse_policy IN (
      'per_run',
      -- Agent must query fresh every run (maximum provider revenue)
      'ttl_cache',
      -- Agent may cache for cache_ttl_seconds (default: static data)
      'unrestricted'
      -- Agent may cache indefinitely (truly static historical datasets)
    ));

-- ── 10. RLS POLICIES FOR NEW TABLES ────────────────────────
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_run_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE used_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_compliance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasonal_contexts ENABLE ROW LEVEL SECURITY;

-- Service role bypasses all RLS (Supabase default)

-- Public read: active agents visible to anyone
CREATE POLICY agents_public_read ON agents
  FOR SELECT TO anon
  USING (is_active = TRUE AND verification_tier != 'unverified');

-- Seasonal contexts: publicly readable
CREATE POLICY seasonal_contexts_public_read ON seasonal_contexts
  FOR SELECT TO anon
  USING (reviewed_at IS NOT NULL);
-- Only reviewed contexts are publicly visible

-- Developers read their own agents
CREATE POLICY agents_developer_read ON agents
  FOR SELECT TO authenticated
  USING (
    developer_id IN (
      SELECT id FROM providers WHERE contact_email = auth.email()
    )
  );

-- Attribution records: agents submit, service role reads
-- No anon or authenticated user can read raw attribution records
-- (privacy protection for originating_user_wallet_hash)
-- Service role reads all for nightly reconciliation — no policy needed
-- beyond the service-role bypass above (P11-style: no anon/authenticated
-- read path is added here on purpose)

-- ── 11. VERIFICATION QUERIES ───────────────────────────────
-- Run after applying this migration to confirm correctness

-- Confirm new tables exist
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('agents', 'agent_run_endpoints', 'used_nonces',
--                    'wallet_links', 'agent_compliance_events', 'seasonal_contexts');
-- Expected: 6 rows

-- Confirm ogip_jurisdictions has territory type and new columns
-- SELECT code, name, jurisdiction_type, sovereignty_profile, un_c24_listed
-- FROM ogip_jurisdictions WHERE jurisdiction_type = 'territory';
-- Expected: 7 rows (TK, PF, NC, WF, CK, NU, AS)

-- Confirm providers has agent_spend_usdc
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'providers' AND column_name = 'agent_spend_usdc';
-- Expected: 1 row

-- Confirm endpoints has agent_reuse_policy
-- SELECT column_name, column_default FROM information_schema.columns
-- WHERE table_name = 'endpoints'
-- AND column_name IN ('cache_ttl_seconds', 'agent_reuse_policy');
-- Expected: 2 rows

-- Confirm RLS enabled on all new tables
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public'
-- AND tablename IN ('agents', 'agent_run_endpoints', 'used_nonces',
--                   'wallet_links', 'agent_compliance_events', 'seasonal_contexts')
-- AND rowsecurity = FALSE;
-- Expected: 0 rows
