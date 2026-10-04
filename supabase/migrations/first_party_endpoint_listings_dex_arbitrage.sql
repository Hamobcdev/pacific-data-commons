-- Lists one more first-party directory-api utility endpoint (Decisions
-- 59/60) on the public /data buyer-browse catalog: multi-chain DEX
-- arbitrage signals across a curated token-pair list — see
-- apps/directory-api/src/services/pacificDexArbitrageService.ts.
--
-- Same real `endpoints` table as every prior first-party migration this
-- session (this build brief described a `first_party_endpoint_listings`
-- table/flat fields shape that doesn't exist anywhere in this repo).
--
-- Data sources changed substantially from the build brief during live
-- verification (the service file's own doc comment has the full
-- record): 4 of 6 named DEX sources and 3 of 5 named gas sources are
-- dead (The Graph's hosted service was fully decommissioned, taking
-- Uniswap v3's, Balancer's, and PancakeSwap's named APIs down with it;
-- EthGasStation doesn't resolve; Blocknative's public endpoint refuses
-- connection; BscScan/Etherscan's no-key gas oracle now requires a key).
-- Replaced with GeckoTerminal (covers Ethereum/Arbitrum/BNB Chain in one
-- API) for DEX prices and standard eth_gasPrice RPC calls for gas.
-- Tinyman and Pact (Algorand) work exactly as specified. The curated
-- pair list is 7, not the 16 originally proposed, after live 2-venue/
-- $100k-liquidity verification.
--
-- Tier 2 ($0.05) — up to 5 upstream fetches per cache cycle across 7
-- pairs, same reasoning as this codebase's other Tier 2 first-party
-- rows (purse-seine, ocean-forecast, coral-bleaching).
--
-- health_check_url points at directory-api's own /health route.
-- integrity_url is deliberately NULL — same reasoning as every other
-- first-party row here: a live proxy over third-party DEX/gas data
-- re-fetched on every cache miss, not a certified dataset with a fixed
-- content hash. bazaar_registered is omitted (defaults FALSE) — same
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
  '23688689-502a-437d-939b-3288d8292534', 'financial_flows', 'dex_arbitrage_signals',
  'Pacific DEX Arbitrage Signal Engine',
  'Multi-chain DEX arbitrage signals across Uniswap v2/v3/v4, SushiSwap, PancakeSwap v2/v3 (via GeckoTerminal), Tinyman and Pact. Covers Ethereum, Arbitrum, BNB Chain, and Algorand for 7 curated token pairs. Returns gross spread, estimated gas costs, net spread and signal quality. Stage 1: curated pairs. Stage 2 will add on-demand pair lookup. Not financial advice.',
  'https://api.synergybcpacific.com', 'https://api.synergybcpacific.com/health', NULL,
  'Pacific', 'real-time',
  '[{"tier":2,"name":"summary","description":"Gas-adjusted arbitrage signals for curated token pairs, optionally filtered by pair/chain/min_spread_pct.","price_usdc":0.05,"path":"/finance/arbitrage-signals"}]'::jsonb,
  'public', 'fully_commercial',
  'x402-global-challenge', true
);
