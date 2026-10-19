-- Reconciles public.endpoints against apps/directory-api/src/routeSchemas.ts
-- after a read-only audit found: 2 human_deliverable mismatches, 19 rows
-- with pricing_tiers.price_usdc stale from the 2026-10-18 pricing uplift,
-- 4 rows with a stale pricing_tiers.path (2 originally flagged by the
-- audit, 2 more found while fixing Section 2's price targets), and 9
-- orphaned duplicate rows with no path field at all, left over from
-- before the real routes were wired up.
--
-- Applied live via Supabase MCP against poiiwcbriqwczmppoevd on
-- 2026-10-20 (Anthony approved after reviewing the generated SQL); this
-- file is the committed record of that already-applied change, not a
-- pending one — matches this repo's existing convention of checking in
-- the exact SQL that was run (see e.g. 20261018000002's own header).
--
-- Rows: 44 -> 35. human_deliverable: 21 true / 23 false -> 23 true / 12 false.
--
-- All UPDATE/DELETE statements below target rows by id, not by the
-- text/shape matches the original build brief specified — several of
-- those would have silently matched zero rows (e.g. the Fiji GDP,
-- Pacific Crypto Price History, and Pacific Ocean Climate Forecast rows
-- have no "path" field in pricing_tiers at all) or targeted the wrong
-- jsonb level (pricing_tiers is an array, so a tier's own fields live at
-- {0,path}/{0,price_usdc}, not {path}/{price_usdc}).

-- ============================================================
-- SECTION 1 — human_deliverable mismatches (2 rows)
-- routeSchemas.ts has humanDeliverable: true for both routes;
-- these two rows were stuck at false.
-- ============================================================

UPDATE public.endpoints
SET human_deliverable = true
WHERE id = '42b67237-57a7-4696-a02f-4ff49b76845b'  -- Fiji GDP — National Accounts (2019 Rebase)
  AND human_deliverable = false;

UPDATE public.endpoints
SET human_deliverable = true
WHERE id = 'd25b654c-8232-4894-99c3-ee7e60fd3245'  -- Pacific Purse Seine Catch — WCPFC Historical Data
  AND human_deliverable = false;

-- ============================================================
-- SECTION 2 — stale pricing_tiers.price_usdc (19 rows)
-- Surgical jsonb_set on {0,price_usdc} only — preserves each
-- row's existing name/path/description fields.
-- ============================================================

UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.20') WHERE id = 'b89ccdec-038e-4452-86c7-0bdf04a3ff31'; -- Fiji CPI: 0.01 -> 0.20
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.20') WHERE id = '3d1aa99a-40b2-4e75-9064-a378d9c002c6'; -- Pacific CPI & Inflation: 0.01 -> 0.20
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.20') WHERE id = 'f615fa13-8a33-4005-a0e7-807d73b34016'; -- Pacific GDP 6 Nations: 0.01 -> 0.20
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.20') WHERE id = 'd2f97ca2-a57d-44a8-bb9e-83333c477b65'; -- Pacific Population 6 Nations: 0.01 -> 0.20
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.20') WHERE id = '52fcc22b-8550-4a49-943b-41df7f366f3e'; -- Samoa CPI & Inflation: 0.01 -> 0.20
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.20') WHERE id = 'ecec1645-f90a-493d-8ecb-7c18958cd4e2'; -- Samoa GDP Expenditure Approach: 0.01 -> 0.20
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.25') WHERE id = '2f971f4d-22ea-42d8-9be2-2a429cdf0769'; -- Pacific Remittance Corridor Comparison: 0.01 -> 0.25
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.25') WHERE id = 'afe6e36f-4d20-4b04-af64-b8d41dcb9989'; -- Pacific ENSO Index: 0.05 -> 0.25
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.25') WHERE id = '8af8298c-65c1-46fc-ae6d-4a1e79881318'; -- Pacific Coral Bleaching Alerts: 0.05 -> 0.25
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.30') WHERE id = 'e8cc7bbf-67c3-4086-a5f4-57d137e3e096'; -- Pacific Cyclone History: 0.05 -> 0.30
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.40') WHERE id = 'd25b654c-8232-4894-99c3-ee7e60fd3245'; -- Pacific Purse Seine Catch: 0.05 -> 0.40
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.40') WHERE id = '2ee033bd-7415-4468-9eea-9ce3e43340eb'; -- Pacific DEX Arbitrage Signal Engine: 0.05 -> 0.40
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.15') WHERE id = '43f273f0-eec6-4160-96ad-377acb2fb341'; -- Pacific Sea Surface Temp & Ocean Conditions: 0.01 -> 0.15
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.15') WHERE id = 'e9c3ba05-820f-4f89-8b80-c6e5d4d88774'; -- Pacific Water Temperature NOAA Stations: 0.01 -> 0.15
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.10') WHERE id = '393beacd-af47-4e7c-a638-b54483c83224'; -- Pacific Crypto Price Feed: 0.001 -> 0.10
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.10') WHERE id = 'f7e0c061-9fd7-4035-a575-e08278e45795'; -- Pacific FX Rates: 0.001 -> 0.10
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.20') WHERE id = '42b67237-57a7-4696-a02f-4ff49b76845b'; -- Fiji GDP National Accounts: 0.05 -> 0.20
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.15') WHERE id = '8947317c-35eb-483a-a8be-89d37d6d4e79'; -- Pacific Crypto Price History: 0.01 -> 0.15
UPDATE public.endpoints SET pricing_tiers = jsonb_set(pricing_tiers, '{0,price_usdc}', '0.20') WHERE id = '752f12e2-5ad3-412c-a847-fcc4bc368149'; -- Pacific Ocean Climate Forecast: 0.05 -> 0.20

-- ============================================================
-- SECTION 3 — stale paths originally flagged by the audit (2 rows)
-- ============================================================

UPDATE public.endpoints
SET pricing_tiers = jsonb_set(pricing_tiers, '{0,path}', '"/climate/pacific-coral-bleaching"')
WHERE id = '8af8298c-65c1-46fc-ae6d-4a1e79881318'
  AND pricing_tiers->0->>'path' = '/climate/coral-bleaching';

UPDATE public.endpoints
SET pricing_tiers = jsonb_set(pricing_tiers, '{0,path}', '"/fisheries/pacific-purse-seine"')
WHERE id = 'd25b654c-8232-4894-99c3-ee7e60fd3245'
  AND pricing_tiers->0->>'path' = '/fisheries/purse-seine';

-- ============================================================
-- SECTION 3B — additional stale paths found while wiring up
-- Section 2's price targets for these two rows (not in the
-- original audit's 2-row list; same bug, found during the fix)
-- ============================================================

UPDATE public.endpoints
SET pricing_tiers = jsonb_set(pricing_tiers, '{0,path}', '"/climate/ocean-temperature"')
WHERE id = '43f273f0-eec6-4160-96ad-377acb2fb341'
  AND pricing_tiers->0->>'path' = '/climate/ocean-temperature?country=WS';

UPDATE public.endpoints
SET pricing_tiers = jsonb_set(pricing_tiers, '{0,path}', '"/climate/pacific-ocean-temp"')
WHERE id = 'e9c3ba05-820f-4f89-8b80-c6e5d4d88774'
  AND pricing_tiers->0->>'path' = '/climate/water-temperature';

-- ============================================================
-- SECTION 4 — delete orphaned duplicate rows with no path field (9 rows)
-- Each row's title duplicates a properly-wired sibling row above;
-- these never carried a path and weren't reachable by any real route.
-- ============================================================

DELETE FROM public.endpoints WHERE id = 'c001ee7c-8f5d-4ed0-9250-9d744ffb5971'; -- Pacific Crypto Rates
DELETE FROM public.endpoints WHERE id = 'f4ef6a5b-e5e5-410c-a28c-5119c6ada1e8'; -- Pacific Foreign Exchange Rates
DELETE FROM public.endpoints WHERE id = '04ec640f-23c0-4178-8367-acd9589ce9fc'; -- Pacific DEX Arbitrage Signals
DELETE FROM public.endpoints WHERE id = 'bfc5552a-3f6f-48cf-bcd5-6d4d4e8dfcd7'; -- Pacific Coral Bleaching Events
DELETE FROM public.endpoints WHERE id = '3948d456-c9a2-442e-b6bb-3df93c9a021e'; -- Pacific Purse-Seine Tuna Catch
DELETE FROM public.endpoints WHERE id = 'a66575ef-b729-4fa9-8429-23ed911a5de1'; -- Pacific Remittance Corridor Rates
DELETE FROM public.endpoints WHERE id = 'a3321121-5d72-4eb4-aeb4-3ddf7ad18596'; -- Pacific Ocean Surface Temperature
DELETE FROM public.endpoints WHERE id = '6ffc30ec-7912-43ec-81a3-309c6051124f'; -- Samoa Consumer Price Index
DELETE FROM public.endpoints WHERE id = 'b938e4ad-caf8-423a-99f5-63fc5e6d2164'; -- Samoa GDP — National Accounts
