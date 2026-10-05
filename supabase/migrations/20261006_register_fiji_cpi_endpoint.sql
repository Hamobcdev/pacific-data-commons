-- Registers /finance/fiji-cpi on the public /data buyer-browse catalog —
-- same pattern as supabase/migrations/20261005071120_register_fiji_gdp_endpoint.sql
-- (which this mirrors) and the first_party_endpoint_listings_*.sql series.
--
-- Source: Fiji Bureau of Statistics own monthly CPI press releases
-- (Decision 42 — governance/research endpoint over an openly-accessible
-- government report, Tier 1 capped, never paywalled) — see
-- apps/directory-api/src/services/fijiCpiService.ts for the full sourcing
-- doc comment. Only July-September 2026 are covered (each month's own
-- FBoS release page) — no fabricated months.
--
-- update_frequency is 'monthly' — verified against the live endpoints
-- table constraint (project poiiwcbriqwczmppoevd) before writing this,
-- same verification as the pacific-enso-index migration.
--
-- health_check_url points at directory-api's own /health route.
-- integrity_url is deliberately NULL — a static transcribed dataset, not a
-- certified dataset carrying a dataset_content_hash under the Pacific Data
-- Protocol /integrity flow. bazaar_registered omitted (defaults FALSE).
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
  '23688689-502a-437d-939b-3288d8292534', 'financial_flows', 'fiji_cpi_fbos',
  'Fiji Consumer Price Index',
  'Fiji Consumer Price Index (CPI) — monthly inflation data transcribed directly from the Fiji Bureau of Statistics'' own monthly CPI press releases. Covers July-September 2026. Optional filters: ?year= (4-digit), ?from=/?to= (YYYY-MM range).',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'monthly',
  '[{"tier":1,"name":"summary","description":"Monthly Fiji CPI index value, month-over-month change, year-on-year inflation, and 12-month average inflation.","price_usdc":0.01,"path":"/finance/fiji-cpi"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
