-- Registers /climate/pacific-enso-index on the public /data buyer-browse
-- catalog (same pattern as the other first-party directory-api listings —
-- see supabase/migrations/first_party_endpoint_listings_pacific_cyclone_history.sql
-- for the most recent one, which this mirrors exactly).
--
-- update_frequency is 'monthly', NOT the master prompt's claimed 'weekly'
-- CHECK value — verified directly against the live endpoints table
-- (project poiiwcbriqwczmppoevd) before writing this migration:
-- endpoints_update_frequency_check only allows real-time/daily/monthly/
-- annual/static/irregular. 'weekly' would have failed this CHECK when
-- Anthony pasted it into the SQL editor.
--
-- Source: NOAA PSL Multivariate ENSO Index v2 (MEI.v2), public domain —
-- see apps/directory-api/src/routes/climate/pacificEnsoIndex.ts. Tier 2
-- ($0.05, per this endpoint's own build brief) to match
-- PACIFIC_ENSO_INDEX_PRICE_USDC in routeSchemas.ts — same price/tier
-- pairing convention as the other Tier 2 first-party rows (cyclone-history,
-- coral-bleaching, ocean-forecast), not Tier 1's $0.01.
--
-- health_check_url points at directory-api's own /health route.
-- integrity_url is deliberately NULL — same reasoning as the other
-- first-party rows: a static reference bundle, not a certified dataset
-- carrying a dataset_content_hash under the Pacific Data Protocol
-- /integrity flow. bazaar_registered omitted (defaults FALSE).
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
  '23688689-502a-437d-939b-3288d8292534', 'climate', 'enso_mei_noaa',
  'Pacific ENSO / El Nino Index',
  'Pacific ENSO / El Nino index (MEI.v2) — bimonthly values 1979-present. Positive = El Nino conditions, negative = La Nina. Source: NOAA Climate Prediction Center / PSL, public domain. Optional filters: ?year=, ?from=, ?to=, ?phase=elnino|lanina|neutral.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'monthly',
  '[{"tier":2,"name":"summary","description":"Bimonthly MEI.v2 ENSO index values and derived phase, filterable by year range and phase.","price_usdc":0.05,"path":"/climate/pacific-enso-index"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
