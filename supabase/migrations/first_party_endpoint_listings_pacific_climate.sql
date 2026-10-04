-- Lists one more first-party directory-api utility endpoint (Decisions
-- 59/60) on the public /data buyer-browse catalog: Pacific water
-- temperature at NOAA CO-OPS tide stations (Pago Pago, American Samoa and
-- Honolulu, Hawaii) — see apps/directory-api/src/services/pacificWaterTemperatureService.ts.
--
-- This replaces an earlier plan to wrap the Pacific Data Hub CKAN API
-- (pacificdata.org). Confirmed live in this session: every pacificdata.org
-- API request carrying a query string (package_search, package_show,
-- datastore_search, even organization_list?all_fields=true) returns
-- Cloudflare's "Just a moment" managed-challenge page (HTTP 403), while
-- bare no-query-string calls (status_show, package_list) succeed. That
-- challenge requires a JS-capable browser to solve and can't be passed by
-- a server-side fetch, so a wrapper over it would 403 in production on
-- every real query. NOAA CO-OPS's Data Getter API has no such gate.
--
-- Same pattern as first_party_endpoint_listings_samoa_cpi_ocean_climate.sql:
-- provider_id is SBP's own "SBP pilot test account" provider row, endpoint_url
-- is directory-api's own base URL, pricing_tiers.path carries the actual
-- query path. data_sub_category is deliberately NOT "ocean_temperature" —
-- that value is already used by the existing /climate/ocean-temperature row
-- (Open-Meteo Marine: sea surface temperature + wave/current model output
-- for 7 Pacific Island countries). This row is a different, narrower thing:
-- a live instrument reading at two specific NOAA tide stations, one of
-- which (Honolulu) is a Pacific reference station rather than a Pacific
-- Island nation. A distinct data_sub_category keeps the two rows
-- disambiguated per that earlier migration's own stated reasoning.
--
-- health_check_url points at directory-api's own /health route.
-- integrity_url is deliberately NULL — same reasoning as the ocean-climate
-- row: this is a live proxy over a third-party API re-fetched on every
-- cache miss, not a certified dataset with a fixed content hash.
-- bazaar_registered is omitted (defaults FALSE) — the route declares an
-- x402 extensions.bazaar discovery schema in code (routeSchemas.ts), but
-- no one has asserted it's been manually registered in GoPlausible's
-- Bazaar dashboard, same conservative default as the prior migration.
--
-- NOT auto-applied by this migration file landing in the repo — apply
-- manually against the Supabase project, same as the prior migration's
-- own note.

INSERT INTO endpoints (
  provider_id, data_category, data_sub_category, title, description,
  endpoint_url, health_check_url, integrity_url,
  geography_region, update_frequency,
  pricing_tiers, sensitivity_level, commercial_eligibility,
  competition_tag, is_active
) VALUES
(
  '23688689-502a-437d-939b-3288d8292534', 'climate', 'water_temperature_noaa',
  'Pacific Water Temperature — NOAA Stations',
  'Live water temperature readings at two NOAA CO-OPS Pacific tide stations: Pago Pago, American Samoa, and Honolulu, Hawaii (a Pacific reference station, not a Pacific Island nation). Sourced from NOAA''s Tides & Currents Data Getter API. A primary-source US federal station reading, not a Pacific Island national meteorological- or fisheries-authority-certified feed — see the endpoint''s own attribution field. Requires ?station= (1770000 or 1617760), default 1770000.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'real-time',
  '[{"tier":1,"name":"summary","description":"Current water temperature reading at one NOAA CO-OPS Pacific tide station.","price_usdc":0.01,"path":"/climate/water-temperature"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
