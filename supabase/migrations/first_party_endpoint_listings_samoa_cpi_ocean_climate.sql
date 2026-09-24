-- List two first-party directory-api utility endpoints (Decisions 59/60)
-- on the public /data buyer-browse catalog: Samoa CPI (World Bank Open
-- Data wrapper, PR #67... see apps/directory-api/src/services/samoaCpiService.ts)
-- and Pacific sea surface temperature/ocean conditions (Open-Meteo Marine
-- wrapper, see apps/directory-api/src/services/pacificOceanClimateService.ts).
--
-- Same pattern as session21_competition_prep.sql / session23's research-
-- paper rows: provider_id is SBP's own "SBP pilot test account" provider
-- row (id confirmed by those two prior migrations), endpoint_url is the
-- service's own base URL, and pricing_tiers.path carries the actual query
-- path. Filename is deliberately not session-numbered — this session's
-- actual number in your own tracking isn't something I can verify from the
-- repo alone; rename to match your convention if you want.
--
-- NOT restricted to a single value like session21/23's endpoint_url
-- (pdcpilot-endpoint-production.up.railway.app) — these two rows point at
-- directory-api's own base URL (api.synergybcpacific.com) instead, since
-- that's where these first-party endpoints actually live. data_sub_category
-- disambiguates both from each other (and from any future directory-api
-- first-party row sharing the same endpoint_url).
--
-- health_check_url points at directory-api's own /health route.
-- integrity_url is deliberately NULL: unlike a certified dataset with a
-- content hash (Decision 49's /integrity check), these are live proxies
-- over a third-party API re-fetched on every cache miss — there is no
-- fixed dataset content to hash. bazaar_registered is omitted (defaults
-- FALSE) — both routes declare an x402 extensions.bazaar discovery schema
-- in code (routeSchemas.ts), but that is not the same claim session23's
-- comment makes with bazaar_registered=true/false: whether someone has
-- manually registered the listing in GoPlausible's own Bazaar dashboard.
-- No evidence either way here, so this follows session23's conservative
-- default rather than asserting it.
--
-- NOT auto-applied by this migration file landing in the repo — apply
-- manually against the Supabase project, same as session23's own note.

INSERT INTO endpoints (
  provider_id, data_category, data_sub_category, title, description,
  endpoint_url, health_check_url, integrity_url,
  geography_region, update_frequency,
  pricing_tiers, sensitivity_level, commercial_eligibility,
  competition_tag, is_active
) VALUES
(
  '23688689-502a-437d-939b-3288d8292534', 'financial_flows', 'samoa_cpi',
  'Samoa Consumer Price Index & Inflation',
  'Samoa Consumer Price Index (2010=100) and annual inflation rate, sourced from World Bank Open Data (indicators FP.CPI.TOTL / FP.CPI.TOTL.ZG). World Bank attributes the underlying figures to the Samoa Bureau of Statistics; this is a structured queryable wrapper over that published series, not an SBS- or Samoa-government-certified feed — see the endpoint''s own attribution field.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Samoa', 'annual',
  '[{"tier":1,"name":"summary","description":"Merged level + inflation observations, most recent N years (default 15, max 60 via ?years=), plus the latest single observation.","price_usdc":0.01,"path":"/finance/samoa-cpi"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
),
(
  '23688689-502a-437d-939b-3288d8292534', 'climate', 'ocean_temperature',
  'Pacific Sea Surface Temperature & Ocean Conditions',
  'Current sea surface temperature, wave height/period/direction, ocean current velocity, and a 7-day wave forecast for Samoa, Fiji, Tonga, PNG, Solomon Islands, Vanuatu, and the Cook Islands — sourced from Open-Meteo''s Marine Weather API. Not a national meteorology-, SPC-, or fisheries-authority-certified feed — see the endpoint''s own attribution field. Requires ?country= (WS/FJ/TO/PG/SB/VU/CK).',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'real-time',
  '[{"tier":1,"name":"summary","description":"Current sea surface temperature, wave conditions, ocean current velocity, and a 7-day wave forecast for one Pacific country.","price_usdc":0.01,"path":"/climate/ocean-temperature"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
