-- Lists one more first-party directory-api utility endpoint (Decisions
-- 59/60) on the public /data buyer-browse catalog: historical South
-- Pacific cyclone tracks (PR #103, merged) — see
-- apps/directory-api/src/routes/climate/pacificCycloneHistory.ts.
--
-- This endpoint was built and deployed in a prior session but its
-- /data browse card was missed, because the browse page
-- (apps/web/app/[locale]/(public)/data/page.tsx via
-- lib/directory/get-public-listings.ts) reads the `endpoints` table
-- directly — a route being live on directory-api (and even listed in
-- /.well-known/x402's discovery manifest) is a separate discovery
-- channel from the buyer-browse catalog. Registering the route doesn't
-- list it on /data; only a row in this table does.
--
-- Same pattern as the prior first-party migrations: provider_id is SBP's
-- own "SBP pilot test account" provider row, endpoint_url is directory-
-- api's own base URL, pricing_tiers.path carries the actual query path.
-- update_frequency is 'static' (not 'daily' or 'real-time' like the live
-- proxy rows above it) — the route's own file header says the IBTrACS
-- data is "bundled as a static JSON asset at build time (no KV writes)",
-- so there is no live upstream refetch to describe as daily or
-- real-time. Price ($0.05) and description text are taken verbatim from
-- this route's own routeSchemas.ts entry (PACIFIC_CYCLONE_HISTORY_PRICE_USDC),
-- so the catalog card and the endpoint's own x402 discovery schema agree
-- on price — Tier 2, matching the other multi-filter/computed-aggregate
-- rows (coral-bleaching, ocean-forecast), not Tier 1's single-value-
-- lookup $0.01.
--
-- health_check_url points at directory-api's own /health route.
-- integrity_url is deliberately NULL — same reasoning as the other
-- first-party rows: this is a bundled reference dataset, not a
-- certified dataset carrying a dataset_content_hash under the Pacific
-- Data Protocol /integrity flow. bazaar_registered is omitted (defaults
-- FALSE) — same conservative default as the prior first-party
-- migrations.
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
  '23688689-502a-437d-939b-3288d8292534', 'climate', 'cyclone_history_ibtracs',
  'Pacific Cyclone History',
  'Historical tropical cyclone tracks for the South Pacific basin (1960-present), sourced from IBTrACS v04r01 (NOAA/NCEI, public domain). Returns one record per storm with peak wind (kt), minimum pressure (mb), landfall flag, category (TD/C1-C5), and affected Pacific nation codes (FJ, WS, TO, VU, SB, PF, CK, TV, KI). Optional filters: ?season= (4-digit year), ?nation= (ISO-2 code), ?min_category= (td|c1|c2|c3|c4|c5), ?landfall=true, ?limit= (default 100, max 500). 1-hour cache. 851 storms indexed.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'static',
  '[{"tier":2,"name":"summary","description":"Historical South Pacific cyclone tracks (1960-present), filterable by season, nation, category, and landfall.","price_usdc":0.05,"path":"/climate/pacific-cyclone-history"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
