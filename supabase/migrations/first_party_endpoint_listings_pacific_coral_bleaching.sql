-- Lists one more first-party directory-api utility endpoint (Decisions
-- 59/60) on the public /data buyer-browse catalog: daily coral bleaching
-- alert levels and degree heating weeks for a Pacific reef region, from
-- NOAA Coral Reef Watch's CoralTemp 5km product — see
-- apps/directory-api/src/services/pacificCoralBleachingService.ts.
--
-- This build brief described a `first_party_endpoint_listings` table
-- with fields endpoint_path/name/price_usdc (flat)/tags. No such table
-- exists anywhere in this repo's migration history — confirmed by
-- grepping every migration for a matching CREATE TABLE. The real table
-- every first-party endpoint (including this session's prior 4) is
-- listed in is `endpoints` (session1_migration.sql), with title/
-- pricing_tiers (a JSONB array, not a flat price_usdc column)/no tags
-- column at all. This migration follows that real schema, same pattern
-- as the 4 migrations before it, not the brief's described one.
--
-- Data source note: confirmed live before writing any service code (this
-- endpoint's own build brief required it) that CRW_BAA (bleaching alert
-- area, 0-4) and CRW_DHW (degree heating weeks) both genuinely exist in
-- NOAA's CoralTemp product — so mean_dhw is included in the response,
-- not dropped. The brief named THREDDS (pae-paha.pacioos.hawaii.edu)
-- first with ERDDAP as a fallback; THREDDS was live-tested and found
-- unreliable (repeated ~30s timeouts) and gave an untrustworthy-looking
-- time-index result, so this endpoint talks to ERDDAP only (reliable and
-- fast on every live check) — via .csv rather than .ascii, since .ascii
-- returns a live HTTP 400 for this specific ERDDAP dataset while .csv on
-- an identical query works. See the service file's own doc comment for
-- the full detail.
--
-- Same pattern as the prior first-party migrations: provider_id is SBP's
-- own "SBP pilot test account" provider row, endpoint_url is directory-
-- api's own base URL, pricing_tiers.path carries the actual query path.
-- Tier 2 (not Tier 1): this is a multi-variable regional computation
-- (nearest-valid-cell alert level, region-wide max alert, region-wide
-- mean DHW) per request, not a single-value lookup — same reasoning as
-- the purse-seine and ocean-forecast rows.
--
-- health_check_url points at directory-api's own /health route.
-- integrity_url is deliberately NULL — same reasoning as every other
-- first-party row here: a live proxy over a third-party product
-- re-fetched (and re-aggregated) on every cache miss, not a certified
-- dataset with a fixed content hash. bazaar_registered is omitted
-- (defaults FALSE) — same conservative default as the prior migrations.
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
  '23688689-502a-437d-939b-3288d8292534', 'climate', 'coral_bleaching_noaa',
  'Pacific Coral Bleaching Alerts',
  'Daily coral bleaching alert levels (0-4) and degree heating weeks for a Pacific reef region. Source: NOAA Coral Reef Watch CoralTemp 5km daily satellite product, via ERDDAP. Default coordinates: Samoa (-13.759°N, -172.104°E). Optional ?lat=, ?lon=, ?radius_deg= (default 2.0, 0.1-10) define the query region. Data updates daily with ~24h processing lag — data_currency in every response is always "daily".',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'daily',
  '[{"tier":2,"name":"summary","description":"Nearest-cell bleaching alert level, region-wide max alert and mean DHW for a Pacific reef region.","price_usdc":0.05,"path":"/climate/coral-bleaching"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
