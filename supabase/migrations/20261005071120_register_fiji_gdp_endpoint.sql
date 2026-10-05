-- List the /finance/fiji-gdp first-party directory-api endpoint
-- (Decision 42, same posture as samoa-gdp) on the public /data
-- buyer-browse catalog. See
-- apps/directory-api/src/services/fijiGdpService.ts for the full sourcing
-- doc comment.
--
-- Same pattern as first_party_endpoint_listings_samoa_gdp_fx.sql
-- (provider_id is SBP's own "SBP pilot test account" provider row, same
-- id that migration and session21/23's rows use; endpoint_url is
-- directory-api's own base URL).
--
-- pricing_tiers uses this table's established {tier, name, description,
-- price_usdc, path} shape (matching every other first-party listing
-- migration), not a bare {tier, price_usdc, label} shape — the dataset
-- detail page (apps/web/.../[datasetSlug]/page.tsx) renders tier.name and
-- tier.description directly, so a tier object missing those fields would
-- render blank on the live page.
--
-- geography_country / time_period_start / time_period_end are populated
-- here (unlike the samoa-gdp/fx migration, which left them unset) since
-- this endpoint has a well-defined single-country, fixed-year-range
-- scope (FJ, 2019-2024) that those columns exist specifically to record.
--
-- health_check_url / integrity_url: same reasoning as every other
-- first-party listing migration — NULL integrity_url, this is static
-- transcribed data with no fixed dataset content to hash.
--
-- NOT auto-applied by this migration file landing in the repo — apply
-- manually against the Supabase project, same as every prior first-party
-- listing migration.

INSERT INTO endpoints (
  provider_id, data_category, data_sub_category, title, description,
  endpoint_url, health_check_url, integrity_url,
  geography_country, geography_region,
  time_period_start, time_period_end, update_frequency,
  pricing_tiers, sensitivity_level, commercial_eligibility,
  competition_tag, is_active
) VALUES (
  '23688689-502a-437d-939b-3288d8292534', 'financial_flows', 'fiji_gdp',
  'Fiji GDP by Industry',
  'Fiji GDP by industry, transcribed from the Fiji Bureau of Statistics'' own published rebase release (FBoS Release No. 62, 3 Sep 2025, GDP rebased to 2019 base) — not a third-party-aggregated feed, see the endpoint''s own attribution field. Required ?year=2019-2024. Optional ?measure=nominal|real_growth, default nominal. Industry-level breakdown is published only for 2019 (the rebase base year); 2020-2024 return total GDP plus real growth rate only (2024 is preliminary).',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  ARRAY['FJ'], 'Pacific',
  2019, 2024, 'annual',
  '[{"tier":1,"name":"summary","description":"Fiji GDP by industry for one requested year (2019-2024), nominal or real growth rate.","price_usdc":0.01,"path":"/finance/fiji-gdp"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
