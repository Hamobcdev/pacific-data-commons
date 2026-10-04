-- Lists one more first-party directory-api utility endpoint (Decisions
-- 59/60) on the public /data buyer-browse catalog: Pacific remittance
-- corridor cost comparison for 9 AU/NZ/US -> Pacific Island corridors —
-- see apps/directory-api/src/services/pacificRemittanceService.ts.
--
-- Same real `endpoints` table as every prior first-party migration this
-- session.
--
-- Data source note: World Bank's Remittance Prices Worldwide API
-- (remittanceprices.worldbank.org) is confirmed live, during this
-- session, to be entirely Cloudflare bot-challenge-gated for
-- server-side requests — the bare root domain and every query variant
-- tried returned the same "Just a moment..." challenge (HTTP 403), with
-- or without a browser User-Agent. traditional_rails is therefore null
-- for every corridor in practice right now (not a per-corridor gap —
-- the whole source is unreachable), with traditional_rails_note
-- explaining why on every corridor. The service still attempts a real
-- fetch each cycle (not a hardcoded permanent null) in case a
-- differently-networked production deployment has different access.
-- live_fx_rate and crypto_rails (the live-FX and static-crypto-fee
-- portions of this endpoint) are unaffected by this and work normally —
-- see the service file's own doc comment for the full detail.
--
-- Tier 1 ($0.01) — quarterly source data (even when reachable, World
-- Bank's own underlying data only updates quarterly), lightweight fetch,
-- same tier as this codebase's other Tier 1 first-party rows.
--
-- health_check_url points at directory-api's own /health route.
-- integrity_url is deliberately NULL — same reasoning as every other
-- first-party row here: a live proxy over third-party data re-fetched
-- on every cache miss, not a certified dataset with a fixed content
-- hash. bazaar_registered is omitted (defaults FALSE) — same
-- conservative default as the prior migrations.
--
-- NOT auto-applied by this migration file landing in the repo — apply
-- manually against the Supabase project, same as the prior migrations'
-- own note.

INSERT INTO endpoints (
  provider_id, data_category, data_sub_category, title, description,
  endpoint_url, health_check_url, integrity_url,
  geography_region, update_frequency,
  pricing_tiers, sensitivity_level, commercial_eligibility,
  competition_tag, is_active
) VALUES
(
  '23688689-502a-437d-939b-3288d8292534', 'financial_flows', 'remittance_corridors',
  'Pacific Remittance Corridor Comparison',
  'Remittance corridor cost comparison for 9 Australia/New Zealand/USA -> Pacific Island corridors (Samoa, Fiji, PNG, Tonga). Traditional-rail costs from World Bank Remittance Prices Worldwide (currently unreachable from this server — see the service file''s doc comment; traditional_rails is null with an explanatory note on every corridor until that changes) vs. XRP/XLM/ALGO crypto-rail network-fee estimates, at a $200 benchmark send amount. Consumes /finance/fx internally for live cross-rates. Crypto rail costs are network fees only — on/off-ramp costs are additional and vary by provider. Optional ?corridor=, ?min_saving_pct=, ?token=. Not financial advice.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'daily',
  '[{"tier":1,"name":"summary","description":"9-corridor remittance cost comparison, optionally filtered by corridor/min_saving_pct/token.","price_usdc":0.01,"path":"/finance/remittance-corridors"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
