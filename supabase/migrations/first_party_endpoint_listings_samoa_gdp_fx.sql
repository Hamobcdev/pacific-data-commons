-- List two more first-party directory-api utility endpoints (Decisions
-- 42/59/60) on the public /data buyer-browse catalog: Samoa GDP
-- (expenditure approach, transcribed from SBS's own published report —
-- see apps/directory-api/src/services/samoaGdpService.ts) and Pacific FX
-- rates (community currency-api + Frankfurter/ECB + CoinGecko wrapper —
-- see apps/directory-api/src/services/fxRateService.ts).
--
-- Same pattern as first_party_endpoint_listings_samoa_cpi_ocean_climate.sql
-- (provider_id is SBP's own "SBP pilot test account" provider row, same id
-- that migration and session21/23's rows use; endpoint_url is
-- directory-api's own base URL; data_sub_category disambiguates each row).
--
-- Source attribution note: the samoa-gdp row below attributes to Samoa
-- Bureau of Statistics, matching that endpoint's real transcribed source.
-- The fx row attributes to its real sources (community currency-api,
-- Frankfurter/ECB, CoinGecko) — NOT the Central Bank of Samoa. CBS has no
-- relationship with this data; fxRateService.ts's own doc comment is
-- explicit about where every rate actually comes from, and Decision 59/60's
-- entire point is never attributing first-party data to an institution
-- that hasn't certified it (same reasoning samoaCpiService.ts and
-- samoaGdpService.ts already apply to themselves).
--
-- price_usdc for fx is 0.001, not 0.01 — matching FX_PRICE_USDC in
-- apps/directory-api/src/routeSchemas.ts exactly (priced below even the
-- wallet-balance utility fee, Session 30's low-friction-repeat-query
-- reasoning). A directory listing showing the wrong price would mislead
-- buyers about what they're actually charged.
--
-- health_check_url / integrity_url: same reasoning as the CPI/ocean
-- migration — NULL integrity_url, these are live proxies with no fixed
-- dataset content to hash.
--
-- NOT auto-applied by this migration file landing in the repo — apply
-- manually against the Supabase project, same as every prior first-party
-- listing migration. Confirmed via live query (2026-10-04) that neither
-- this nor the samoa-cpi/ocean-temperature migration has been applied yet
-- — none of samoa-cpi, samoa-gdp, ocean-temperature (under this exact
-- data_sub_category), or fx currently have a row in `endpoints` at all, so
-- none of them appear on /en/data yet. Applying this file alone will not
-- surface samoa-cpi — that still needs
-- first_party_endpoint_listings_samoa_cpi_ocean_climate.sql applied too.

INSERT INTO endpoints (
  provider_id, data_category, data_sub_category, title, description,
  endpoint_url, health_check_url, integrity_url,
  geography_region, update_frequency,
  pricing_tiers, sensitivity_level, commercial_eligibility,
  competition_tag, is_active
) VALUES
(
  '23688689-502a-437d-939b-3288d8292534', 'financial_flows', 'samoa_gdp',
  'Samoa GDP — Expenditure Approach',
  'Samoa GDP, expenditure approach, transcribed from the Samoa Bureau of Statistics'' own published FY2025/26 report — not a third-party-aggregated feed, see the endpoint''s own attribution field. FY2025/26: real GDP -8.1%, nominal -4.7%. Optional ?fiscal_year=2025/26|2024/25 to filter to one year, or ?all=true for both. Default: latest year only. Updated at most yearly, no fixed schedule.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Samoa', 'annual',
  '[{"tier":1,"name":"summary","description":"FY2025/26 GDP expenditure approach (nominal/real growth, FCE, GCF, external balance), optionally filtered to one fiscal year or all published years.","price_usdc":0.01,"path":"/finance/samoa-gdp"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
),
(
  '23688689-502a-437d-939b-3288d8292534', 'financial_flows', 'fx',
  'Pacific FX Rates',
  'Pacific FX rates: WST, FJD, TOP, PGK, SBD, VUV plus AUD, NZD, EUR, GBP, JPY, CNY, ALGO, and USDC, base USD. Optional conversion via ?from=&to=&amount=. Sourced from a community-maintained currency API, Frankfurter (ECB reference rates) for the six ECB-tracked majors, and CoinGecko for ALGO — not a Central Bank of Samoa- or any national-authority-certified feed, see the endpoint''s own attribution field. Updated daily, 60-minute cache.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'daily',
  '[{"tier":1,"name":"summary","description":"All Pacific + major currency rates, base USD, or a direct from/to/amount conversion.","price_usdc":0.001,"path":"/finance/fx"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
