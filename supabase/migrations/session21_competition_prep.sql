-- Session 21: competition prep.
--
-- 1) Directory demand signals — records every search, including
--    zero-result searches, as evidence of unmet demand for the
--    competition submission.
--
-- 2) Three new SBP-listed endpoints on the existing pilot-endpoint
--    deployment (2 research working papers + 1 Pacific blockchain
--    adoption dataset). category = 'governance' — the Session 21 brief
--    said 'governance_policy', but Session 20 already shipped 'governance'
--    live with nothing using it yet; the live DB/type wins, not the brief's
--    wording (user-confirmed). data_sub_category disambiguates all three
--    from each other and from the fisheries/ocean rows, since
--    resolveDirectoryContext() now matches on
--    (endpoint_url, data_category, data_sub_category) rather than the
--    first two alone — see apps/pilot-endpoint's directoryContext.ts.

CREATE TABLE IF NOT EXISTS directory_demand_signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_query    TEXT,
  category        TEXT,
  results_count   INTEGER NOT NULL DEFAULT 0,
  fulfilled       BOOLEAN GENERATED ALWAYS AS (results_count > 0) STORED,
  searcher_type   TEXT CHECK (searcher_type IN ('agent', 'human', 'unknown'))
                  DEFAULT 'unknown',
  searched_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_signals_category
  ON directory_demand_signals(category, searched_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_signals_unfulfilled
  ON directory_demand_signals(fulfilled, searched_at DESC)
  WHERE fulfilled = FALSE;

ALTER TABLE directory_demand_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_demand_signals" ON directory_demand_signals
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "service_role_demand_signals" ON directory_demand_signals
  FOR ALL TO service_role USING (true);

INSERT INTO endpoints (
  provider_id, data_category, data_sub_category, title, description,
  endpoint_url, health_check_url, integrity_url,
  geography_region, time_period_start, time_period_end, update_frequency,
  pricing_tiers, sensitivity_level, commercial_eligibility,
  competition_tag, is_active
) VALUES
(
  '23688689-502a-437d-939b-3288d8292534', 'governance', 'law_before_code',
  'Law Before Code: Sequencing Legislation, Governance and Technology for Samoa''s Sovereign Digital Public Infrastructure',
  'Working paper on the governance sequencing framework required before blockchain activation in Pacific SIDS. Covers BIS PFMI, FATF R.15, CISA ZTMM 2.0 compliance architecture. Under NUS/ISOC Pacific Digital Infrastructure Research Programme review.',
  'https://pdcpilot-endpoint-production.up.railway.app', 'https://pdcpilot-endpoint-production.up.railway.app/health', 'https://pdcpilot-endpoint-production.up.railway.app/integrity',
  'Pacific', 2026, 2026, 'static',
  '[{"tier":1,"name":"summary","description":"Structured working paper metadata: abstract, policy gaps identified, governance frameworks referenced, citation.","price_usdc":0.01,"path":"/research/law-before-code"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
),
(
  '23688689-502a-437d-939b-3288d8292534', 'governance', 'cryptographic_continuity',
  'Cryptographic Continuity: Why Pacific Digital Infrastructure Requires a Standing Security Mandate',
  'Working paper proposing a Cryptographic Continuity Mandate for Pacific SIDS digital infrastructure. Addresses post-quantum cryptography, AI-assisted cryptanalysis, hardware security, and harvest-now-decrypt-later threats in Pacific government context.',
  'https://pdcpilot-endpoint-production.up.railway.app', 'https://pdcpilot-endpoint-production.up.railway.app/health', 'https://pdcpilot-endpoint-production.up.railway.app/integrity',
  'Pacific', 2026, 2026, 'static',
  '[{"tier":1,"name":"summary","description":"Structured working paper metadata: abstract, incidents analysed, mandate components, citation.","price_usdc":0.01,"path":"/research/cryptographic-continuity"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
),
(
  '23688689-502a-437d-939b-3288d8292534', 'governance', 'blockchain_adoption',
  'Pacific Blockchain and Digital Asset Adoption Landscape 2026',
  'Structured, queryable dataset covering blockchain and digital asset adoption status across Pacific Islands Forum member states — regulatory sandbox status, CBDC research stage, digital economy strategy status, and Lagatoi signatory status. Compiled from publicly available regulatory announcements, government digital economy strategies, and Forum Secretariat documentation.',
  'https://pdcpilot-endpoint-production.up.railway.app', 'https://pdcpilot-endpoint-production.up.railway.app/health', 'https://pdcpilot-endpoint-production.up.railway.app/integrity',
  'Pacific', 2026, 2026, 'static',
  '[{"tier":1,"name":"summary","description":"8 Pacific nations: regulatory sandbox status, CBDC research stage, digital economy strategy, Lagatoi signatory status.","price_usdc":0.01,"path":"/pacific/blockchain-adoption"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
