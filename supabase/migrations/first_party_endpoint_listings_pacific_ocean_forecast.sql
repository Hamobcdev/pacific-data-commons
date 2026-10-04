-- Lists one more first-party directory-api utility endpoint (Decisions
-- 59/60) on the public /data buyer-browse catalog: daily Pacific Ocean
-- surface forecast from the HYCOM GLBy0.08 Global Ocean Model, served via
-- Pacific Data Hub's THREDDS/OPeNDAP server — see
-- apps/directory-api/src/services/pacificOceanForecastService.ts.
--
-- Two corrections from this endpoint's original build brief, both
-- verified live against the file's own .dds/catalog listing before
-- writing any code (see the service file's own doc comment for the full
-- detail): this product has NO salinity variable anywhere (dropped from
-- the response and from this row's description, not fabricated), and the
-- requested Pacific Island bounding box at native grid resolution is
-- ~1.09M cells/variable — too large to fetch/parse exhaustively for a
-- live paid request, so the service reports a stride-sampled regional
-- mean instead (region_sample_size in the response says how many cells
-- contributed). sea_surface_elevation_m (from the file's surf_el
-- variable) was added beyond the original brief at the requester's
-- explicit follow-up request — real, available data, useful surge
-- context for maritime agents.
--
-- Why update_frequency is 'daily' (not 'real-time' or 'annual' like the
-- other first-party climate/fisheries rows): HYCOM publishes one new
-- "best" FMRC-aggregated file per day (confirmed live: 20261002,
-- 20261003, 20261004 all present in the PCCOS/HYCOM catalog). This is
-- FORECAST MODEL OUTPUT on a daily publish cadence, not an instrument
-- reading and not a historical archive — data_currency in every response
-- is always "daily-forecast", never "real-time" or "historical", and
-- every response carries its own forecast_reference_date and valid_time
-- so an agent can tell exactly which model run it's consuming.
--
-- Same pattern as the prior first-party migrations: provider_id is SBP's
-- own "SBP pilot test account" provider row, endpoint_url is directory-
-- api's own base URL, pricing_tiers.path carries the actual query path
-- (Tier 2 — a multi-variable regional-mean computation per request, not a
-- single-value lookup, same reasoning as the purse-seine row).
--
-- health_check_url points at directory-api's own /health route.
-- integrity_url is deliberately NULL — same reasoning as every other
-- first-party row here: this is a live proxy over a third-party model
-- output re-fetched (and re-aggregated) on every cache miss, not a
-- certified dataset with a fixed content hash. bazaar_registered is
-- omitted (defaults FALSE) — same conservative default as the prior
-- first-party migrations.
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
  '23688689-502a-437d-939b-3288d8292534', 'climate', 'ocean_forecast_hycom',
  'Pacific Ocean Forecast — HYCOM Daily Model',
  'Daily Pacific Ocean surface forecast from the HYCOM Global Ocean Model (GLBy0.08, 0.08° native resolution), served via Pacific Data Hub THREDDS (tds.pacificdata.org). Returns mean surface temperature, mean current speed/direction, and mean sea surface elevation for the Pacific Island region (lat -25 to 25, lon 150–220°E), each a stride-sampled regional mean (region_sample_size in the response says how many grid cells contributed — not an exhaustive area average). FORECAST MODEL OUTPUT — not instrument readings. data_currency is always "daily-forecast"; every response states its own forecast_reference_date and valid_time. No salinity field: this HYCOM product has no salinity variable. Updated daily; 6-hour response cache. Attribution: Pacific Community (SPC) via Pacific Data Hub THREDDS.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'daily',
  '[{"tier":2,"name":"summary","description":"Regional-mean surface temperature, current speed/direction, and sea surface elevation for the Pacific Island region, today''s model run.","price_usdc":0.05,"path":"/climate/ocean-forecast"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
