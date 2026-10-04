-- Lists one more first-party directory-api utility endpoint (Decisions
-- 59/60) on the public /data buyer-browse catalog: real-time prices for
-- a curated crypto token list, Pacific-priority weighted, from
-- CoinGecko's free public API — see
-- apps/directory-api/src/services/pacificCryptoRatesService.ts.
--
-- Same real `endpoints` table as every prior first-party migration this
-- session (this build brief, like the coral-bleaching one before it,
-- described a `first_party_endpoint_listings` table/flat `price_usdc`/
-- `tags` shape that doesn't exist anywhere in this repo's schema).
--
-- Curated list is 67 tokens, not the 75 named in the build brief: the
-- brief's own enumerated id list, deduplicated (it listed "aptos"
-- twice), is 71 unique ids. Of those, `polygon`, `compound`, and
-- `synthetix` aren't valid CoinGecko ids (confirmed live — empty
-- response), and `base` resolves to an unrelated, essentially worthless
-- microcap token rather than Coinbase's L2 (which has no native token
-- at all) — dropped rather than mislabelled. 71 - 3 - 1 = 67. See the
-- service file's own doc comment for the full detail.
--
-- Tier 1 ($0.001) — a high-volume single-value-per-token price lookup,
-- same tier class as this codebase's other Tier 1 first-party rows, not
-- Tier 2 like the multi-variable regional computations (purse-seine,
-- ocean-forecast, coral-bleaching).
--
-- health_check_url points at directory-api's own /health route.
-- integrity_url is deliberately NULL — same reasoning as every other
-- first-party row here: a live proxy over a third-party API re-fetched
-- on every cache miss, not a certified dataset with a fixed content
-- hash. bazaar_registered is omitted (defaults FALSE) — same
-- conservative default as the prior migrations.
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
  '23688689-502a-437d-939b-3288d8292534', 'financial_flows', 'crypto_rates_coingecko',
  'Pacific Crypto Price Feed',
  'Real-time prices for 67 curated crypto tokens with Pacific-priority weighting (ALGO, XRP, XLM). Source: CoinGecko public API. Optional ?symbols= filter and ?category=pacific shortcut. Cache TTL: 60s.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'real-time',
  '[{"tier":1,"name":"summary","description":"Full curated token price list, or filtered by ?symbols=/?category=.","price_usdc":0.001,"path":"/finance/crypto-rates"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
