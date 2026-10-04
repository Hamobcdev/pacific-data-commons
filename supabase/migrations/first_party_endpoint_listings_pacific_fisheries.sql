-- Lists one more first-party directory-api utility endpoint (Decisions
-- 59/60) on the public /data buyer-browse catalog: historical purse seine
-- catch for the Western and Central Pacific, sourced from WCPFC's Public
-- Domain 1°x1° Monthly dataset via Pacific Data Hub's THREDDS/OPeNDAP
-- server — see apps/directory-api/src/services/pacificFisheriesPurseSeineService.ts.
--
-- WCPFC public domain status: WCPFC (Western and Central Pacific
-- Fisheries Commission) publishes this aggregated catch/effort grid as
-- public domain data on its own scientific data dissemination pages
-- (https://www.wcpfc.int/scientificdatadissemination); Pacific Data Hub's
-- PCCOS group reprocesses and re-serves it via THREDDS, per the dataset's
-- own NC_GLOBAL "source" attribute ("Downloaded from the WCPFC Public
-- Domain scientific data web pages, and reprocessed by PCCOS"). No API
-- key required — confirmed live. This is a first-party PDC wrapper over
-- that already-open aggregate, same Decision 59/60 posture as the other
-- rows in this table, not a paywall on WCPFC's own published data.
--
-- THREDDS source and why update_frequency is 'annual', not 'real-time':
-- the underlying file (WCPFC_S_PUBLIC_BY_1x1_MM.nc, confirmed live via
-- its THREDDS .dds/.das) is monthly-gridded, 1967-12 through 2021-12 —
-- WCPFC member nations submit catch reports that are verified over a
-- 1–2 year cycle before WCPFC publishes them, so this is fundamentally a
-- historical archive updated on WCPFC's own multi-year verification
-- cadence, never a live feed. Every layer of this endpoint (service doc
-- comment, response's own data_currency/reporting_lag_note fields,
-- route description, this row's description, and the manifest entry in
-- apps/web/app/.well-known/x402/route.ts) says so explicitly — the Data
-- Integrity concern behind this migration is making sure no agent or
-- buyer could mistake a 2021-vintage figure for a current one.
--
-- Same pattern as first_party_endpoint_listings_pacific_climate.sql:
-- provider_id is SBP's own "SBP pilot test account" provider row,
-- endpoint_url is directory-api's own base URL, pricing_tiers.path
-- carries the actual query path (Tier 2 here, not Tier 1 — this endpoint
-- aggregates 5 gear-mode variables across the full grid per request, a
-- multi-variable historical summary rather than a single-value lookup).
--
-- health_check_url points at directory-api's own /health route.
-- integrity_url is deliberately NULL — same reasoning as the climate
-- rows: this is a live proxy over a third-party archive re-fetched (and
-- re-aggregated) on every cache miss, not a certified dataset with a
-- fixed content hash. bazaar_registered is omitted (defaults FALSE) —
-- same conservative default as the prior two first-party migrations.
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
  '23688689-502a-437d-939b-3288d8292534', 'fisheries', 'purse_seine_wcpfc',
  'Pacific Purse Seine Catch — WCPFC Historical Data',
  'Historical aggregated purse seine catch and effort data for the Western and Central Pacific Ocean. Sourced from the WCPFC Public Domain 1°x1° Monthly dataset via Pacific Data Hub THREDDS server (tds.pacificdata.org). Covers 1967–2021 (live-verified dataset coverage) — WCPFC member catch reports carry a 1–2 year verification lag; this is not real-time data. Returns total catch in metric tonnes for Skipjack, Yellowfin, or Bigeye tuna, summed across all fishing-gear/set-type variables and the full grid for the requested year. Albacore is not available — this purse-seine dataset has no albacore variable (albacore is primarily a longline-caught species, not purse seine). Suitable for fisheries trend analysis, stock assessment context, and licensing benchmarks. ?species=skj|yft|bet (default skj), ?year=YYYY (required, 1967–2021).',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'annual',
  '[{"tier":2,"name":"summary","description":"Historical purse seine catch summary for one species, optional year filter.","price_usdc":0.05,"path":"/fisheries/purse-seine"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
