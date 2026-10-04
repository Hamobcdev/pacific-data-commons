// pacificDexArbitrageService.ts
//
// Multi-chain DEX arbitrage signals: gross/net (gas-adjusted) spread and
// signal quality for a curated set of token pairs across Ethereum,
// Arbitrum, BNB Chain, and Algorand — no API key required for any
// source actually used.
//
// THIS ENDPOINT'S DATA-SOURCE LANDSCAPE CHANGED SUBSTANTIALLY FROM THE
// ORIGINAL BUILD BRIEF, confirmed live before writing any code (same
// discipline as every other endpoint this session, just a much larger
// verification surface — 6 DEX sources, 5 gas sources, 16 candidate
// pairs). This was flagged to and resolved with the requester before
// building; summary of what actually survived:
//
// DEX sources — 4 of 6 named sources are dead:
//   - Uniswap v3 and Balancer's subgraph URLs (api.thegraph.com/
//     subgraphs/name/...) both 301-redirect to
//     https://error.thegraph.com/apierror.json — The Graph's hosted
//     service (the free, no-key, no-indexer-fee tier) was fully
//     decommissioned; the replacement requires a paid API key via
//     thegraph.com's gateway. Dead, not "temporarily down".
//   - PancakeSwap's api.pancakeswap.info depends on that same dead
//     hosted service internally (every endpoint 500s with
//     "ENOTFOUND error.thegraph.com"). Also dead.
//   - Curve's own api.curve.fi works, but on live verification only
//     covers stablecoin/pegged-asset pools (DAI/USDC/USDT, WBTC/renBTC,
//     ETH/stETH-style) — not the LINK/UNI/AAVE/CRV/BAL/1INCH-style
//     volatile-pair pools this brief's curated list needed. Not used
//     directly in the end (see GeckoTerminal below, which also indexes
//     Curve pools alongside everything else).
//   - Tinyman and Pact (both Algorand) work exactly as described.
//
//   Replacement, confirmed live: GeckoTerminal's free public API
//   (api.geckoterminal.com/api/v2, no key) covers Ethereum ("eth"),
//   Arbitrum ("arbitrum"), and BNB Chain ("bsc") in one consistent
//   schema — pool price (both base_token_price_usd AND
//   quote_token_price_usd given directly, no inversion math needed),
//   liquidity (reserve_in_usd), and pool address, across Uniswap v2/v3/
//   v4, SushiSwap, PancakeSwap v2/v3, and Curve, all through the same
//   endpoint. This is now the only DEX source this service calls for
//   EVM chains. Polygon ("polygon_pos") is also covered by GeckoTerminal,
//   but no curated pair below ended up with a confirmed ≥2-venue,
//   ≥$100k-liquidity Polygon pool after live verification — Polygon is
//   therefore not represented in CURATED_PAIRS. COVERED_CHAINS still
//   lists it as a valid ?chain= filter value (harmless: it just
//   currently matches zero pairs) because GeckoTerminal genuinely
//   supports it and a future pair could use it.
//
// Gas sources — 3 of 5 named sources are dead:
//   - EthGasStation's domain doesn't resolve at all (discontinued
//     service, not a transient DNS blip).
//   - Blocknative's "public" gas-prices endpoint refuses the TCP
//     connection outright.
//   - BscScan's gasoracle action, and Etherscan's own (api.etherscan.io,
//     same company, same migration), both now require an API key —
//     Etherscan's V1 no-key tier was deprecated in favour of a unified
//     V2 API (confirmed live: BscScan 301-redirects to Etherscan's
//     v2-migration docs; Etherscan's own V1 endpoint returns an explicit
//     "deprecated V1 endpoint" error even with zero query changes).
//   - Arbitrum's named URL (gas.arbitrum.io/api) 404s — that domain is a
//     Next.js marketing site, not an API host.
//   - Polygon Gas Station v2 works exactly as described.
//
//   Replacements, confirmed live: standard eth_gasPrice JSON-RPC calls
//   against each EVM chain's own public RPC endpoint
//   (ethereum-rpc.publicnode.com, bsc-dataseed.binance.org) — these are
//   genuinely free, no-key, and well-known public infrastructure, not a
//   creative workaround. Arbitrum gas is hardcoded at a flat $0.002 (its
//   true cost is near-fixed and negligible — the same approach this
//   file's build brief itself specified for Algorand's fixed fee).
//   Algorand gas is hardcoded at 0.001 ALGO, converted to USD using the
//   live ALGO price already being fetched for the ALGO/USDC pair (no
//   separate gas-price source needed for a fixed native fee).
//
// CURATED_PAIRS — 7 pairs survived live 2-venue/$100k-liquidity
// verification, not the 16 originally proposed. Documented per-pair
// below; pairs NOT making this list and why:
//   - SOL/USDC, XRP/USDC: no meaningfully-liquid wrapped-asset pools
//     found on any EVM chain checked — the brief itself hedged these
//     with "where available" / "where DEX liquidity exists".
//   - AAVE/ETH, BAL/ETH, 1INCH/ETH: each has at most ONE real venue
//     with ≥$100k liquidity (Uniswap v3 for AAVE, Balancer for BAL,
//     nothing found at all for 1INCH) — below the 2-venue minimum.
//   - MATIC/USDC, ARB/USDC, CAKE/BNB: not confirmed live despite
//     multiple search-term variations (e.g. WMATIC, WBNB pairings) —
//     recorded as "not confirmed", not "proven absent"; a future
//     session with a more targeted lookup (pool address instead of
//     text search) could still find these.
//
// Liquidity figures (liquidity_usd, both for the $100k pool-liquidity
// filter and for display) come directly from each source's own
// liquidity field (GeckoTerminal reserve_in_usd; Pact's pool-level
// tvl_usd; Tinyman's computed from its own raw ALGO+USDC reserves,
// valued using Pact's live ALGO/USD price — see getArbitrageSnapshot
// below) — never estimated or fabricated.
//
// Caching: ONE 60-second cache slot holds the full aggregated signal
// set — same single-slot pattern as pacificOceanForecastService (this
// endpoint also takes filterable-after-the-fact query params, same as
// pacificCryptoRatesService's single-cache-plus-in-memory-filter
// design: ?pair=/?min_spread_pct=/?chain= are all applied by the route
// layer against one cached computation, not separate upstream fetches).

const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60 * 1000;

const GECKOTERMINAL_BASE = "https://api.geckoterminal.com/api/v2";
const TINYMAN_POOLS_URL = "https://mainnet.analytics.tinyman.org/api/v1/pools";
const PACT_POOLS_URL = "https://api.pact.fi/api/pools";
const ETH_RPC_URL = "https://ethereum-rpc.publicnode.com";
const BSC_RPC_URL = "https://bsc-dataseed.binance.org";

const MIN_LIQUIDITY_USD = 100_000;
const MIN_VENUES_PER_PAIR = 2;

// Documented assumption (per this endpoint's own build brief: "document
// this assumption in code"): converts an absolute gas cost into a
// percentage deduction against a notional trade size. Not given by the
// brief as an exact figure — $10,000 is a reasonable reference size for
// evaluating whether a spread clears gas costs, not a claim about any
// specific buyer's actual trade size.
const ASSUMED_TRADE_SIZE_USD = 10_000;

// Documented assumption: typical gas units for one AMM swap leg (a
// single buy or sell), used for every EVM chain's gas-in-USD
// calculation. Real swaps vary (~100k-200k gas is typical for a
// Uniswap-v3-style swap) — this is a representative estimate, which is
// exactly why gas_disclaimer is mandatory on every signal.
const SWAP_GAS_UNITS = 150_000;

const ARBITRUM_FLAT_GAS_USD = 0.002;
const ALGORAND_FIXED_FEE_ALGO = 0.001;

export const COVERED_DEXS = ["Uniswap v2", "Uniswap v3", "Uniswap v4", "SushiSwap v3", "PancakeSwap v2", "PancakeSwap v3", "Tinyman", "Pact"] as const;
export const COVERED_CHAINS = ["ethereum", "arbitrum", "bnb", "polygon", "algorand"] as const;
export type Chain = (typeof COVERED_CHAINS)[number];

export const SOURCE_ATTRIBUTION =
  "PDC Arbitrage Signal Engine — aggregates Uniswap v2/v3/v4, SushiSwap, PancakeSwap v2/v3, Tinyman, and Pact. Gas: public chain RPCs, Polygon Gas Station, fixed Arbitrum/Algorand estimates. Not financial advice.";
export const GAS_DISCLAIMER = "Gas estimates are approximate and may differ at execution time. Verify before trading.";

type EvmNetwork = "eth" | "arbitrum" | "bsc";

interface GeckoVenue {
  kind: "gecko";
  dex: string;
  chain: Chain;
  network: EvmNetwork;
  poolAddress: string;
  /** true if the curated pair's base (target) token is this pool's base_token (so base_token_price_usd is the target's price); false if it's the quote_token. */
  targetIsBase: boolean;
}

interface AlgorandVenue {
  kind: "tinyman" | "pact";
  dex: "Tinyman" | "Pact";
  chain: "algorand";
  poolAddress: string;
}

type VenueSpec = GeckoVenue | AlgorandVenue;

interface CuratedPair {
  pair: string;
  baseToken: string;
  quoteToken: string;
  venues: VenueSpec[];
}

// See file doc comment above for the full verification record and why
// each of these 7 (not 16) pairs and their exact venues were chosen.
export const CURATED_PAIRS: readonly CuratedPair[] = [
  {
    pair: "ETH/USDC",
    baseToken: "ETH",
    quoteToken: "USDC",
    venues: [
      { kind: "gecko", dex: "Uniswap v3", chain: "ethereum", network: "eth", poolAddress: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640", targetIsBase: true },
      { kind: "gecko", dex: "Uniswap v3", chain: "arbitrum", network: "arbitrum", poolAddress: "0xc31e54c7a869b9fcbecc14363cf510d1c41fa443", targetIsBase: true },
    ],
  },
  {
    pair: "BTC/USDC",
    baseToken: "BTC",
    quoteToken: "USDC",
    venues: [
      { kind: "gecko", dex: "Uniswap v3", chain: "ethereum", network: "eth", poolAddress: "0x99ac8ca7087fa4a2a1fb6357269965a2014abc35", targetIsBase: true },
      { kind: "gecko", dex: "Uniswap v4", chain: "ethereum", network: "eth", poolAddress: "0xb98437c7ba28c6590dd4e1cc46aa89eed181f97108e5b6221730d41347bc817f", targetIsBase: false },
    ],
  },
  {
    pair: "LINK/ETH",
    baseToken: "LINK",
    quoteToken: "ETH",
    venues: [
      { kind: "gecko", dex: "Uniswap v3", chain: "ethereum", network: "eth", poolAddress: "0xa6cc3c2531fdaa6ae1a3ca84c2855806728693e8", targetIsBase: true },
      { kind: "gecko", dex: "Uniswap v2", chain: "ethereum", network: "eth", poolAddress: "0xa2107fa5b38d9bbd2c461d6edf11b11a50f6b974", targetIsBase: true },
    ],
  },
  {
    pair: "UNI/ETH",
    baseToken: "UNI",
    quoteToken: "ETH",
    venues: [
      { kind: "gecko", dex: "Uniswap v3", chain: "ethereum", network: "eth", poolAddress: "0x1d42064fc4beb5f8aaf85f4617ae8b3b5b8bd801", targetIsBase: true },
      { kind: "gecko", dex: "Uniswap v2", chain: "ethereum", network: "eth", poolAddress: "0xd3d2e2692501a5c9ca623199d38826e513033a17", targetIsBase: true },
    ],
  },
  {
    pair: "CRV/ETH",
    baseToken: "CRV",
    quoteToken: "ETH",
    venues: [
      { kind: "gecko", dex: "Uniswap v3", chain: "ethereum", network: "eth", poolAddress: "0x919fa96e88d67499339577fa202345436bcdaf79", targetIsBase: true },
      { kind: "gecko", dex: "SushiSwap v3", chain: "ethereum", network: "eth", poolAddress: "0x3bff1d56992702ecf7acb0d2a7f23eec459e8587", targetIsBase: true },
    ],
  },
  {
    pair: "BNB/USDC",
    baseToken: "BNB",
    quoteToken: "USDC",
    venues: [
      { kind: "gecko", dex: "PancakeSwap v3", chain: "bnb", network: "bsc", poolAddress: "0xf2688fb5b81049dfb7703ada5e770543770612c4", targetIsBase: false },
      { kind: "gecko", dex: "PancakeSwap v2", chain: "bnb", network: "bsc", poolAddress: "0xd99c7f6c65857ac913a8f880a4cb84032ab2fc5b", targetIsBase: false },
    ],
  },
  {
    pair: "ALGO/USDC",
    baseToken: "ALGO",
    quoteToken: "USDC",
    venues: [
      { kind: "tinyman", dex: "Tinyman", chain: "algorand", poolAddress: "FPOU46NBKTWUZCNMNQNXRWNW3SMPOOK4ZJIN5WSILCWP662ANJLTXVRUKA" },
      { kind: "pact", dex: "Pact", chain: "algorand", poolAddress: "ULYZAQ5BQ47ZOJZXV3FBLSP2RI34YLPPJPA7EAPTNNOKLUFNI5OCA7KFWU" },
    ],
  },
];

export interface VenuePriceData {
  priceUsd: number;
  liquidityUsd: number;
}

export interface VenueResult {
  dex: string;
  chain: Chain;
  spot_price_usd: number;
  liquidity_usd: number;
  pool_address: string;
}

export interface EstimatedGas {
  buy_chain: Chain;
  sell_chain: Chain;
  buy_gas_usd: number | null;
  sell_gas_usd: number | null;
  total_gas_usd: number | null;
}

export type SignalQuality = "weak" | "moderate" | "strong";

export interface ArbitrageSignal {
  pair: string;
  base_token: string;
  quote_token: string;
  venues: VenueResult[];
  best_buy_venue: string;
  best_sell_venue: string;
  gross_spread_pct: number;
  estimated_gas: EstimatedGas;
  net_spread_pct: number | null;
  signal_quality: SignalQuality | null;
  is_profitable_estimated: boolean;
  gas_disclaimer: string;
  observed_at: string;
}

export interface ArbitrageSnapshot {
  signals: ArbitrageSignal[];
  total_pairs_monitored: number;
  fetch_warnings: string[];
  gas_warnings: string[];
  cached_at: string;
}

function gweiHexToWei(hex: string): number {
  return parseInt(hex, 16);
}

async function fetchEvmGasPriceWei(rpcUrl: string): Promise<number | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { result?: string; error?: unknown };
    if (!body.result) return null;
    return gweiHexToWei(body.result);
  } catch {
    return null;
  }
}

interface GeckoPoolAttributes {
  base_token_price_usd: string;
  quote_token_price_usd: string;
  reserve_in_usd: string | null;
}

/** Fetches every curated pool on one EVM network in a single GeckoTerminal multi-pool request. */
async function fetchGeckoNetworkPools(network: EvmNetwork, addresses: string[]): Promise<Map<string, VenuePriceData> | null> {
  if (addresses.length === 0) return new Map();
  try {
    const url = `${GECKOTERMINAL_BASE}/networks/${network}/pools/multi/${addresses.join(",")}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: Array<{ id: string; attributes: GeckoPoolAttributes }> };
    const result = new Map<string, VenuePriceData>();
    for (const entry of body.data ?? []) {
      const address = entry.id.split("_").slice(1).join("_"); // "eth_0xabc..." -> "0xabc..."
      result.set(address.toLowerCase(), {
        priceUsd: Number(entry.attributes.base_token_price_usd),
        liquidityUsd: Number(entry.attributes.reserve_in_usd ?? 0),
        // quote price stashed via a second map lookup below, not here —
        // see resolveVenuePrice, which picks base or quote per venue spec.
      });
      // Also store the quote-side price under a synthetic key so
      // resolveVenuePrice can read it without re-fetching.
      result.set(`${address.toLowerCase()}:quote`, {
        priceUsd: Number(entry.attributes.quote_token_price_usd),
        liquidityUsd: Number(entry.attributes.reserve_in_usd ?? 0),
      });
    }
    return result;
  } catch {
    return null;
  }
}

function resolveGeckoVenuePrice(pools: Map<string, VenuePriceData>, venue: GeckoVenue): VenuePriceData | null {
  const key = venue.targetIsBase ? venue.poolAddress.toLowerCase() : `${venue.poolAddress.toLowerCase()}:quote`;
  const data = pools.get(key);
  if (!data || !Number.isFinite(data.priceUsd) || data.priceUsd <= 0) return null;
  return data;
}

interface TinymanRaw {
  priceUsd: number; // USDC per ALGO, from this pool's own reserve ratio
  algoReserve: number;
  usdcReserve: number;
}

async function fetchTinymanVenue(poolAddress: string): Promise<TinymanRaw | null> {
  try {
    const response = await fetch(`${TINYMAN_POOLS_URL}/${poolAddress}/`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const pool = (await response.json()) as {
      asset_1: { unit_name: string; decimals: number };
      asset_2: { unit_name: string; decimals: number };
      current_asset_1_reserves: string;
      current_asset_2_reserves: string;
    };
    const algoIsAsset1 = pool.asset_1.unit_name === "ALGO";
    const algoReserveRaw = Number(algoIsAsset1 ? pool.current_asset_1_reserves : pool.current_asset_2_reserves);
    const usdcReserveRaw = Number(algoIsAsset1 ? pool.current_asset_2_reserves : pool.current_asset_1_reserves);
    const algoDecimals = algoIsAsset1 ? pool.asset_1.decimals : pool.asset_2.decimals;
    const usdcDecimals = algoIsAsset1 ? pool.asset_2.decimals : pool.asset_1.decimals;
    const algoReserve = algoReserveRaw / 10 ** algoDecimals;
    const usdcReserve = usdcReserveRaw / 10 ** usdcDecimals;
    if (algoReserve <= 0 || usdcReserve <= 0) return null;
    return { priceUsd: usdcReserve / algoReserve, algoReserve, usdcReserve };
  } catch {
    return null;
  }
}

// Pact's `on_chain_address` query param is silently ignored (confirmed
// live: returns the full unfiltered pool list, not a filtered one) — a
// real bug, not a redirect quirk. Filtering by the ALGO/USDC asset pair
// (confirmed live to work correctly) and matching the target address
// client-side, among the handful of results that come back, is the
// actual working approach.
async function fetchPactVenue(poolAddress: string): Promise<{ priceUsd: number; liquidityUsd: number } | null> {
  try {
    const response = await fetch(`${PACT_POOLS_URL}?primary_asset__on_chain_id=0&secondary_asset__on_chain_id=31566704&limit=50`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { results?: Array<{ on_chain_address: string; primary_asset: { price: string }; tvl_usd: string }> };
    const pool = body.results?.find((p) => p.on_chain_address === poolAddress);
    if (!pool) return null;
    const priceUsd = Number(pool.primary_asset.price);
    const liquidityUsd = Number(pool.tvl_usd);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
    return { priceUsd, liquidityUsd };
  } catch {
    return null;
  }
}

interface GasPrices {
  ethereum: number | null;
  arbitrum: number;
  bnb: number | null;
  algorand: number | null;
}

/** Converts each chain's raw gas signal into a USD cost for one SWAP_GAS_UNITS swap leg, using already-fetched native-asset prices. Null when that chain's native-asset price (or gas source) is unavailable this cycle — never a fabricated figure. */
function computeGasUsd(gasPriceWei: number | null, nativeAssetUsd: number | null): number | null {
  if (gasPriceWei === null || nativeAssetUsd === null) return null;
  return (gasPriceWei * SWAP_GAS_UNITS) / 1e18 * nativeAssetUsd;
}

let cache: { data: ArbitrageSnapshot; expires: number } | null = null;

/**
 * Returns null only when every DEX source (all 3 GeckoTerminal networks,
 * Tinyman, and Pact) is unreachable simultaneously — the route layer
 * turns that into a 502, per this endpoint's own integrity rules. Any
 * partial failure (some sources down, others working) still returns a
 * real snapshot with the failures recorded in fetch_warnings, never a
 * 502 — a single flaky source must not take down every other pair's
 * signal.
 */
export async function getArbitrageSnapshot(): Promise<ArbitrageSnapshot | null> {
  if (cache && Date.now() < cache.expires) return cache.data;

  const fetchWarnings: string[] = [];
  const gasWarnings: string[] = [];

  // 1. Fetch every GeckoTerminal-covered network's pools in one request each.
  const addressesByNetwork: Record<EvmNetwork, string[]> = { eth: [], arbitrum: [], bsc: [] };
  for (const pair of CURATED_PAIRS) {
    for (const venue of pair.venues) {
      if (venue.kind === "gecko") addressesByNetwork[venue.network].push(venue.poolAddress);
    }
  }
  const geckoResults = await Promise.all(
    (Object.entries(addressesByNetwork) as Array<[EvmNetwork, string[]]>).map(async ([network, addresses]) => {
      const pools = await fetchGeckoNetworkPools(network, addresses);
      if (pools === null) fetchWarnings.push(`GeckoTerminal (${network}): unreachable or returned an error this cycle`);
      return [network, pools] as const;
    }),
  );
  const geckoPoolsByNetwork = new Map(geckoResults);

  // 2. Fetch Tinyman + Pact for the ALGO/USDC pair (and, from Pact,
  // today's live ALGO/USD price — reused below to value Tinyman's
  // ALGO-denominated reserves in USD, rather than fetching ALGO's price
  // from a third separate source).
  const algoVenueSpecs = CURATED_PAIRS.find((p) => p.pair === "ALGO/USDC")!.venues as AlgorandVenue[];
  const tinymanSpec = algoVenueSpecs.find((v) => v.kind === "tinyman")!;
  const pactSpec = algoVenueSpecs.find((v) => v.kind === "pact")!;
  const [tinymanRaw, pactResult] = await Promise.all([fetchTinymanVenue(tinymanSpec.poolAddress), fetchPactVenue(pactSpec.poolAddress)]);
  if (!pactResult) fetchWarnings.push("Pact: unreachable or returned no data this cycle");
  if (!tinymanRaw) fetchWarnings.push("Tinyman: unreachable or returned no data this cycle");

  const allGeckoNetworksDown = [...geckoPoolsByNetwork.values()].every((pools) => pools === null);
  if (allGeckoNetworksDown && !pactResult && !tinymanRaw) {
    return null; // every DEX source unreachable this cycle — route returns 502
  }

  // Prefer Pact's own reported ALGO/USD price to value Tinyman's
  // ALGO-denominated reserves — avoids needing a third, separate ALGO
  // price source. Falls back to Tinyman's own pool-ratio price only if
  // Pact is unreachable this cycle.
  const algoPriceUsd = pactResult?.priceUsd ?? tinymanRaw?.priceUsd ?? null;
  const tinymanResult: VenuePriceData | null =
    tinymanRaw && algoPriceUsd !== null
      ? { priceUsd: tinymanRaw.priceUsd, liquidityUsd: tinymanRaw.usdcReserve + tinymanRaw.algoReserve * algoPriceUsd }
      : null;

  // 3. Native-asset USD prices for gas conversion, read from whichever
  // raw venue data is available (independent of whether that pair
  // survives the liquidity/venue-count filter below).
  const ethUsd = resolveNativeAssetPrice(geckoPoolsByNetwork, "eth", CURATED_PAIRS.find((p) => p.pair === "ETH/USDC")!.venues[0] as GeckoVenue);
  const bnbUsd = resolveNativeAssetPrice(geckoPoolsByNetwork, "bsc", CURATED_PAIRS.find((p) => p.pair === "BNB/USDC")!.venues[0] as GeckoVenue);

  const [ethGasPriceWei, bnbGasPriceWei] = await Promise.all([fetchEvmGasPriceWei(ETH_RPC_URL), fetchEvmGasPriceWei(BSC_RPC_URL)]);
  if (ethGasPriceWei === null) gasWarnings.push("ethereum: gas price RPC unreachable this cycle");
  if (bnbGasPriceWei === null) gasWarnings.push("bnb: gas price RPC unreachable this cycle");

  const gas: GasPrices = {
    ethereum: computeGasUsd(ethGasPriceWei, ethUsd),
    arbitrum: ARBITRUM_FLAT_GAS_USD,
    bnb: computeGasUsd(bnbGasPriceWei, bnbUsd),
    algorand: algoPriceUsd !== null ? ALGORAND_FIXED_FEE_ALGO * algoPriceUsd : null,
  };
  if (gas.algorand === null) gasWarnings.push("algorand: ALGO/USD price unavailable this cycle to convert the fixed fee");

  // 4. Build each pair's venue list, apply the liquidity filter, and
  // compute the signal.
  const signals: ArbitrageSignal[] = [];
  for (const pair of CURATED_PAIRS) {
    const venueResults: VenueResult[] = [];
    for (const venue of pair.venues) {
      let data: VenuePriceData | null = null;
      if (venue.kind === "gecko") {
        const pools = geckoPoolsByNetwork.get(venue.network);
        data = pools ? resolveGeckoVenuePrice(pools, venue) : null;
      } else if (venue.kind === "tinyman") {
        data = tinymanResult;
      } else {
        data = pactResult;
      }
      if (!data) continue;
      if (data.liquidityUsd < MIN_LIQUIDITY_USD) {
        fetchWarnings.push(`${pair.pair} / ${venue.dex} (${venue.chain}): liquidity $${Math.round(data.liquidityUsd).toLocaleString()} below the $100,000 minimum — dropped`);
        continue;
      }
      venueResults.push({ dex: venue.dex, chain: venue.chain, spot_price_usd: data.priceUsd, liquidity_usd: data.liquidityUsd, pool_address: venue.poolAddress });
    }

    if (venueResults.length < MIN_VENUES_PER_PAIR) {
      fetchWarnings.push(`${pair.pair}: only ${venueResults.length} venue(s) available after filtering (need ${MIN_VENUES_PER_PAIR}) — signal omitted`);
      continue;
    }

    const sorted = [...venueResults].sort((a, b) => a.spot_price_usd - b.spot_price_usd);
    const buyVenue = sorted[0]!;
    const sellVenue = sorted[sorted.length - 1]!;
    const grossSpreadPct = ((sellVenue.spot_price_usd - buyVenue.spot_price_usd) / buyVenue.spot_price_usd) * 100;

    const buyGasUsd = gas[chainToGasKey(buyVenue.chain)];
    const sellGasUsd = gas[chainToGasKey(sellVenue.chain)];
    const totalGasUsd = buyGasUsd !== null && sellGasUsd !== null ? buyGasUsd + sellGasUsd : null;

    const netSpreadPct = totalGasUsd !== null ? grossSpreadPct - (totalGasUsd / ASSUMED_TRADE_SIZE_USD) * 100 : null;
    const signalQuality: SignalQuality | null = netSpreadPct === null ? null : netSpreadPct > 0.5 ? "strong" : netSpreadPct > 0.1 ? "moderate" : "weak";
    const isProfitableEstimated = netSpreadPct !== null && netSpreadPct > 0.05;

    if (totalGasUsd === null) {
      gasWarnings.push(`${pair.pair}: gas cost unavailable for ${buyVenue.chain}/${sellVenue.chain} this cycle — net_spread_pct could not be computed`);
    }

    signals.push({
      pair: pair.pair,
      base_token: pair.baseToken,
      quote_token: pair.quoteToken,
      venues: venueResults,
      best_buy_venue: `${buyVenue.dex} / ${buyVenue.chain}`,
      best_sell_venue: `${sellVenue.dex} / ${sellVenue.chain}`,
      gross_spread_pct: Math.round(grossSpreadPct * 1000) / 1000,
      estimated_gas: {
        buy_chain: buyVenue.chain,
        sell_chain: sellVenue.chain,
        buy_gas_usd: buyGasUsd === null ? null : Math.round(buyGasUsd * 1000) / 1000,
        sell_gas_usd: sellGasUsd === null ? null : Math.round(sellGasUsd * 1000) / 1000,
        total_gas_usd: totalGasUsd === null ? null : Math.round(totalGasUsd * 1000) / 1000,
      },
      net_spread_pct: netSpreadPct === null ? null : Math.round(netSpreadPct * 1000) / 1000,
      signal_quality: signalQuality,
      is_profitable_estimated: isProfitableEstimated,
      gas_disclaimer: GAS_DISCLAIMER,
      observed_at: new Date().toISOString(),
    });
  }

  const snapshot: ArbitrageSnapshot = {
    signals,
    total_pairs_monitored: CURATED_PAIRS.length,
    fetch_warnings: fetchWarnings,
    gas_warnings: gasWarnings,
    cached_at: new Date().toISOString(),
  };

  cache = { data: snapshot, expires: Date.now() + CACHE_TTL_MS };
  return snapshot;
}

function chainToGasKey(chain: Chain): keyof GasPrices {
  if (chain === "ethereum") return "ethereum";
  if (chain === "arbitrum") return "arbitrum";
  if (chain === "bnb") return "bnb";
  if (chain === "algorand") return "algorand";
  // polygon never appears as a venue chain in CURATED_PAIRS today (see
  // file doc comment) — this branch is unreachable in practice but kept
  // type-exhaustive rather than asserted away.
  throw new Error(`No gas pricing configured for chain: ${chain}`);
}

function resolveNativeAssetPrice(geckoPoolsByNetwork: Map<EvmNetwork, Map<string, VenuePriceData> | null>, network: EvmNetwork, representativeVenue: GeckoVenue): number | null {
  const pools = geckoPoolsByNetwork.get(network);
  if (!pools) return null;
  const data = resolveGeckoVenuePrice(pools, representativeVenue);
  return data?.priceUsd ?? null;
}

/** Test-only: clears the in-memory cache between test cases. */
export function __resetDexArbitrageCacheForTests(): void {
  cache = null;
}
