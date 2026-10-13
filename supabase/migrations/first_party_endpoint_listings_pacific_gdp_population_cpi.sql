-- List three more first-party directory-api utility endpoints (Decisions
-- 59/60/61 — PDC as Pacific Data Registry) on the public /data buyer-browse
-- catalog: Pacific GDP and Pacific Population (World Bank Open Data,
-- 6-country multi-country series — see
-- apps/directory-api/src/services/worldBankPacificGdpService.ts and
-- worldBankPacificPopulationService.ts) and Pacific CPI/inflation (SPC's
-- SDMX data service — see spcPacificCpiService.ts).
--
-- Same pattern as first_party_endpoint_listings_samoa_gdp_fx.sql /
-- first_party_endpoint_listings_samoa_cpi_ocean_climate.sql: provider_id is
-- SBP's own "SBP pilot test account" provider row, endpoint_url is
-- directory-api's own base URL, data_sub_category disambiguates each row
-- from the existing single-country samoa-gdp/samoa-cpi/fiji-gdp/fiji-cpi
-- rows (these three are the 6-country Pacific-wide variants).
--
-- data_category: 'financial_flows' for GDP and CPI (matching
-- first_party_endpoint_listings_samoa_gdp_fx.sql's samoa-gdp row),
-- 'demographics' for population — both already valid under the
-- endpoints_data_category_check constraint (session1_migration.sql /
-- session20_category_expansion.sql) and the canonical
-- apps/directory-api/src/lib/dataCategories.ts DATA_CATEGORIES list; no
-- schema change needed.
--
-- price_usdc for all three is 0.01, matching PACIFIC_GDP_PRICE_USDC /
-- PACIFIC_POPULATION_PRICE_USDC / PACIFIC_CPI_PRICE_USDC exactly in
-- apps/directory-api/src/routeSchemas.ts. A directory listing showing the
-- wrong price would mislead buyers about what they're actually charged.
--
-- health_check_url / integrity_url: same reasoning as every prior
-- first-party listing migration — NULL integrity_url, these are live
-- proxies over a third-party aggregator with no fixed dataset content to
-- hash.
--
-- NOT auto-applied by this migration file landing in the repo — apply
-- manually against the Supabase project, same as every prior first-party
-- listing migration.

INSERT INTO endpoints (
  provider_id, data_category, data_sub_category, title, description,
  endpoint_url, health_check_url, integrity_url,
  geography_region, update_frequency,
  pricing_tiers, sensitivity_level, commercial_eligibility,
  competition_tag, is_active
) VALUES
(
  '23688689-502a-437d-939b-3288d8292534', 'financial_flows', 'pacific_gdp',
  'Pacific GDP — 6 Nations',
  'Annual GDP (current US$) for 6 Pacific Island nations — Fiji, Papua New Guinea, Solomon Islands, Tonga, Vanuatu, Samoa — sourced from World Bank Open Data, not a national-statistics-office-certified feed, see the endpoint''s own attribution field. Optional ?years= (default 15, max 60). Updated at most yearly.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'annual',
  '[{"tier":1,"name":"summary","description":"Per-country annual GDP observations and latest-year summary for all 6 listed nations.","price_usdc":0.01,"path":"/finance/pacific-gdp"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
),
(
  '23688689-502a-437d-939b-3288d8292534', 'demographics', 'pacific_population',
  'Pacific Population — 6 Nations',
  'Annual total population for 6 Pacific Island nations — Fiji, Papua New Guinea, Solomon Islands, Tonga, Vanuatu, Samoa — sourced from World Bank Open Data, not a national-statistics-office-certified feed, see the endpoint''s own attribution field. Optional ?years= (default 10, max 60). Updated at most yearly.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'annual',
  '[{"tier":1,"name":"summary","description":"Per-country annual population observations and latest-year summary for all 6 listed nations.","price_usdc":0.01,"path":"/demographics/pacific-population"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
),
(
  '23688689-502a-437d-939b-3288d8292534', 'financial_flows', 'pacific_cpi',
  'Pacific CPI & Inflation — 6 Nations',
  'Consumer Price Index and inflation rate for 6 Pacific Island nations — Fiji, Papua New Guinea, Solomon Islands, Tonga, Vanuatu, Samoa — sourced from the Pacific Community (SPC)''s SDMX data service, not a national-statistics-office-certified feed, see the endpoint''s own attribution field. Annual, 2016-present.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'annual',
  '[{"tier":1,"name":"summary","description":"Per-country annual CPI index and inflation rate observations for all 6 listed nations, 2016-present.","price_usdc":0.01,"path":"/finance/pacific-cpi"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
