-- Registers /climate/pacific-sea-level on the public /data buyer-browse
-- catalog — same pattern as the other first-party directory-api listings.
--
-- Source: UHSLC (University of Hawaii Sea Level Center), NOAA/NCEI
-- co-sponsored — used instead of BoM SEAFRAME per this endpoint's own
-- build brief's hard stop: BoM's licensing could not be confirmed
-- (bom.gov.au returned HTTP 403 to every fetch attempt this session). See
-- apps/directory-api/src/routes/climate/pacificSeaLevel.ts and
-- scripts/preprocess-sea-level.mjs for the full sourcing doc comment,
-- including why Port Moresby (PNG) is historical-only (1991-1993) while
-- the other 7 stations are current through July 2026.
--
-- update_frequency is 'monthly' — verified against the live endpoints
-- table constraint (project poiiwcbriqwczmppoevd), same verification as
-- the pacific-enso-index and fiji-cpi migrations.
--
-- Tier 2 ($0.15, per this endpoint's own build brief) — a multi-station,
-- multi-source monthly aggregate, not a single-value lookup.
--
-- health_check_url points at directory-api's own /health route.
-- integrity_url is deliberately NULL — a static bundle recomputed from
-- UHSLC daily data at build time, not a certified dataset carrying a
-- dataset_content_hash under the Pacific Data Protocol /integrity flow.
-- bazaar_registered omitted (defaults FALSE).
--
-- NOT auto-applied by this migration file landing in the repo — apply
-- manually against the Supabase project, same as the prior migrations.

INSERT INTO endpoints (
  provider_id, data_category, data_sub_category, title, description,
  endpoint_url, health_check_url, integrity_url,
  geography_region, update_frequency,
  pricing_tiers, sensitivity_level, commercial_eligibility,
  competition_tag, is_active
) VALUES
(
  '23688689-502a-437d-939b-3288d8292534', 'climate', 'sea_level_uhslc',
  'Pacific Sea Level Monitoring',
  'Pacific sea level monitoring — monthly mean sea level for 8 UHSLC tide gauge stations across the Pacific (Samoa, Fiji, Tonga, Vanuatu, Solomon Islands, Kiribati, Tuvalu, Papua New Guinea). Source: University of Hawaii Sea Level Center (UHSLC), NOAA/NCEI co-sponsored -- used in place of BoM SEAFRAME, whose licensing could not be confirmed. Optional filters: ?station=, ?nation=, ?from=/?to= (YYYY-MM range).',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'monthly',
  '[{"tier":2,"name":"summary","description":"Monthly mean sea level (mm, station-relative datum) for 8 Pacific tide gauge stations, filterable by station, nation, and date range.","price_usdc":0.15,"path":"/climate/pacific-sea-level"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
