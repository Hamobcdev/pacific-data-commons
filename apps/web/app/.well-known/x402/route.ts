import { NextResponse } from "next/server";
import { AGENT_REGISTRY } from "@pdc/shared-types";

/**
 * x402 agent discovery manifest, served at the web app's own domain
 * (apps/web, Render service pdc-web) — distinct from
 * apps/directory-api/src/routes/discovery.ts's `/.well-known/x402-directory.json`,
 * which is served at api.synergybcpacific.com and is directory-api's own
 * resource-server manifest. External crawlers (e.g. Walter Hawkins'
 * Algorand agents) poll the web domain for `/.well-known/x402`; this route
 * is the first thing to exist at that path — it did not exist before.
 *
 * CAIP-2 identifiers below are copied from @x402/avm (ALGORAND_MAINNET_CAIP2 /
 * ALGORAND_TESTNET_CAIP2) rather than imported: apps/web has no runtime
 * dependency on any @x402/* package (CLAUDE.md's "always via
 * pdc-x402-adapter, never @x402 directly" rule governs live payment code
 * paths — this file is a static discovery document, not one), and adding
 * that dependency for one constant isn't warranted.
 */
const ALGORAND_MAINNET_CAIP2 = "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=";
const ALGORAND_TESTNET_CAIP2 = "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=";

// Same convention as lib/agents/algorand.ts: NEXT_PUBLIC_ALGORAND_NETWORK
// already exists in apps/web for this exact purpose.
const ALGORAND_NETWORK = process.env.NEXT_PUBLIC_ALGORAND_NETWORK === "testnet" ? "testnet" : "mainnet";
const CAIP2_NETWORK = ALGORAND_NETWORK === "testnet" ? ALGORAND_TESTNET_CAIP2 : ALGORAND_MAINNET_CAIP2;

const DIRECTORY_API_URL = process.env.NEXT_PUBLIC_DIRECTORY_API_URL || "https://api.synergybcpacific.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://pdc-web.onrender.com";

// Decision 8 — $0.01 per directory search. Not an env var: this is a
// published price, same posture as apps/directory-api/discovery.ts's own
// DIRECTORY_QUERY_PRICE_USDC constant.
const DIRECTORY_QUERY_PRICE_USDC = "0.01";

/**
 * 20 of the 21 real data categories (apps/directory-api/src/lib/dataCategories.ts
 * is the source of truth on the API side — that file's own doc comment
 * notes it must be kept in sync with the `endpoints.data_category` CHECK
 * constraint by hand, since directory-api is a separate deployable service
 * apps/web cannot import from). "cultural" is deliberately excluded here,
 * matching discovery.ts's own `DATA_CATEGORIES.filter((c) => c !== "cultural")`
 * — Decision 10: cultural data is "coming soon" only, not yet live for
 * discovery.
 */
const CATEGORIES = [
  "fisheries",
  "climate",
  "trade",
  "demographics",
  "health",
  "agriculture",
  "remittance",
  "legal",
  "geospatial",
  "energy",
  "carbon",
  "tourism",
  "disaster_risk",
  "biodiversity",
  "ocean",
  "education",
  "governance",
  "financial_flows",
  "research",
  "other",
] as const;

interface ManifestEndpoint {
  path: string;
  full_url: string;
  price_usdc: string;
  description: string;
  category: string;
  pay_to: string;
  trust_tier: "bronze" | "directory";
  data_format: "json";
}

/**
 * Wallet addresses are read from environment variables only, never
 * hardcoded (CLAUDE.md P4 / §18). An endpoint whose payTo wallet env var
 * isn't set is omitted from the manifest entirely — same "don't fabricate
 * an address" posture as NEXT_PUBLIC_SBP_UPLOAD_FEE_WALLET and
 * NEXT_PUBLIC_SBP_PAYTO_ADDRESS elsewhere in apps/web/.env.example.
 */
function buildEndpoints(): ManifestEndpoint[] {
  const endpoints: ManifestEndpoint[] = [];

  // Decision 59/60 first-party open-data endpoints. Both actually live on
  // directory-api (api.synergybcpacific.com/finance/samoa-cpi and
  // /climate/ocean-temperature) — not on apps/pilot-endpoint, which only
  // serves the 5-tier fisheries pilot routes. Both share directory-api's
  // PDC_PILOT_EARNINGS_WALLET payTo address (see that service's
  // routeSchemas.ts), mirrored here via env var rather than the literal
  // constant that file uses, per this route's no-hardcoding requirement.
  const pilotEarningsWallet = process.env.PDC_PILOT_EARNINGS_WALLET;
  if (pilotEarningsWallet) {
    endpoints.push(
      {
        path: "/finance/samoa-cpi",
        full_url: `${DIRECTORY_API_URL}/finance/samoa-cpi`,
        price_usdc: "0.01",
        description:
          "Samoa Consumer Price Index and annual inflation rate, sourced from World Bank Open Data. Not an SBS-certified feed — see the response's own attribution field.",
        category: "financial_flows",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
      },
      {
        path: "/climate/ocean-temperature",
        full_url: `${DIRECTORY_API_URL}/climate/ocean-temperature`,
        price_usdc: "0.01",
        description:
          "Pacific sea surface temperature and wave/swell conditions, sourced from Open-Meteo's Marine Weather API.",
        category: "climate",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
      },
      {
        path: "/finance/samoa-gdp",
        full_url: `${DIRECTORY_API_URL}/finance/samoa-gdp`,
        price_usdc: "0.01",
        description: "Samoa GDP expenditure approach — annual. FY2025/26: -8.1% real. Source: Samoa Bureau of Statistics.",
        category: "financial_flows",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
      },
      {
        path: "/climate/pacific-ocean-temp",
        full_url: `${DIRECTORY_API_URL}/climate/pacific-ocean-temp`,
        price_usdc: "0.01",
        description:
          "Live water temperature at a NOAA CO-OPS Pacific tide station (Pago Pago, American Samoa or Honolulu, Hawaii). Primary-source US federal station reading — see the response's own attribution field.",
        category: "climate",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
      },
      {
        path: "/finance/arbitrage-signals",
        full_url: `${DIRECTORY_API_URL}/finance/arbitrage-signals`,
        price_usdc: "0.05",
        description: "Multi-chain DEX arbitrage signals (Uniswap, PancakeSwap, SushiSwap, Tinyman, Pact). Gas-adjusted spread and signal quality for curated token pairs.",
        category: "financial_flows",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
      },
      {
        path: "/finance/remittance-corridors",
        full_url: `${DIRECTORY_API_URL}/finance/remittance-corridors`,
        price_usdc: "0.01",
        description:
          "Pacific remittance corridor cost comparison (AU/NZ/US -> Samoa/Fiji/PNG/Tonga): World Bank RPW traditional-rail costs vs. XRP/XLM/ALGO network-fee estimates, at a $200 benchmark. Not financial advice.",
        category: "financial_flows",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
      },
      {
        path: "/fisheries/pacific-purse-seine",
        full_url: `${DIRECTORY_API_URL}/fisheries/pacific-purse-seine`,
        price_usdc: "0.05",
        description:
          "Historical annual purse seine catch for the Western and Central Pacific (WCPFC Public Domain data, 1967–2021). HISTORICAL, not real-time — see the response's own data_currency and reporting_lag_note fields. Requires ?year=.",
        category: "fisheries",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
      },
      {
        path: "/climate/pacific-ocean-forecast",
        full_url: `${DIRECTORY_API_URL}/climate/pacific-ocean-forecast`,
        price_usdc: "0.05",
        description:
          "Daily Pacific Ocean surface forecast (HYCOM GLBy0.08 model, via Pacific Data Hub THREDDS) — mean surface temperature, current speed/direction, and sea surface elevation for the Pacific Island region. DAILY FORECAST MODEL OUTPUT, not instrument readings — see the response's own data_currency, forecast_reference_date, and valid_time fields.",
        category: "climate",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
      },
      {
        // This route's build brief specified a `price: {amount, currency}`
        // / `payTo` shape for this manifest entry, but every existing
        // entry here (including the two directly above) uses this file's
        // own ManifestEndpoint interface (price_usdc as a string, pay_to,
        // full_url, trust_tier, data_format) — followed that real shape
        // instead so this entry doesn't silently diverge from the type
        // every other endpoint in this array satisfies.
        path: "/climate/pacific-coral-bleaching",
        full_url: `${DIRECTORY_API_URL}/climate/pacific-coral-bleaching`,
        price_usdc: "0.05",
        description:
          "Daily coral bleaching alert levels for Pacific reef areas (NOAA CoralTemp, via ERDDAP). Default region: Samoa. See the response's own data_currency, observation_date, and reporting_lag_note fields.",
        category: "climate",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
      },
    );
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      "x402_wellknown_manifest: PDC_PILOT_EARNINGS_WALLET is not set — omitting samoa-cpi, ocean-temperature, samoa-gdp, water-temperature, purse-seine, ocean-forecast, coral-bleaching, arbitrage-signals, and remittance-corridors from the discovery manifest",
    );
  }

  // directory-api's own $0.01 directory search, payTo'd to its AVM_ADDRESS
  // wallet. Named distinctly here (not AVM_ADDRESS) because apps/web is a
  // separate service with its own env vars — this must be kept equal to
  // directory-api's AVM_ADDRESS value.
  const directoryWallet = process.env.PDC_DIRECTORY_PAYTO_ADDRESS;
  if (directoryWallet) {
    endpoints.push(
      {
        path: "/search",
        full_url: `${DIRECTORY_API_URL}/search`,
        price_usdc: DIRECTORY_QUERY_PRICE_USDC,
        description: "PDC directory search — query all registered Pacific data endpoints.",
        category: "directory",
        pay_to: directoryWallet,
        trust_tier: "directory",
        data_format: "json",
      },
      {
        // directory-api/src/routeSchemas.ts declares no payToAddress for
        // this route, so PdcPaymentGate falls back to its constructor
        // default (env.AVM_ADDRESS) — the same wallet as /search above,
        // not PDC_PILOT_EARNINGS_WALLET (that's only for the Decision
        // 59/60 endpoints pushed in the block above this one). Mirrored
        // here via PDC_DIRECTORY_PAYTO_ADDRESS, same as /search, per this
        // route's no-hardcoding requirement (CLAUDE.md P4/§18) — this must
        // be kept equal to directory-api's own AVM_ADDRESS value.
        path: "/finance/fx",
        full_url: `${DIRECTORY_API_URL}/finance/fx`,
        price_usdc: "0.001",
        description:
          "Pacific FX Registry: all 8 Pacific island currencies (WST, FJD, PGK, TOP, VUV, SBD, XPF, KHR) plus 10 major sender currencies, ALGO, and USDC. Optional ?base=, ?pairs=, ?pacific_only=true, or conversion via ?from=&to=&amount=.",
        category: "financial_flows",
        pay_to: directoryWallet,
        trust_tier: "bronze",
        data_format: "json",
      },
      {
        path: "/finance/crypto-rates",
        full_url: `${DIRECTORY_API_URL}/finance/crypto-rates`,
        price_usdc: "0.001",
        description: "Real-time prices for 67 curated crypto tokens, Pacific-priority weighted (ALGO, XRP, XLM). CoinGecko source.",
        category: "financial_flows",
        pay_to: directoryWallet,
        trust_tier: "bronze",
        data_format: "json",
      },
    );
  } else {
    // eslint-disable-next-line no-console
    console.warn("x402_wellknown_manifest: PDC_DIRECTORY_PAYTO_ADDRESS is not set — omitting /search, /finance/fx, and /finance/crypto-rates from the discovery manifest");
  }

  return endpoints;
}

// @pdc/shared-types' AGENT_REGISTRY is the single source of truth for the
// 6 first-party agents (CLAUDE.md §26.2) — built dynamically here rather
// than hand-duplicated, so this manifest can't drift from the real
// marketplace catalogue the way the Session 8 "Flag 8" incident did.
function buildAgentCatalogue() {
  return Object.values(AGENT_REGISTRY).map((agent) => ({
    id: agent.slug,
    name: agent.name,
    categories: agent.categories,
  }));
}

export async function GET() {
  return NextResponse.json(
    {
      version: "1.0",
      provider: "Pacific Data Commons",
      operator: "Synergy Blockchain Pacific",
      description:
        "Sovereign Pacific data directory — x402-gated endpoints for AI agents and researchers. " +
        "Built on Algorand. Data sovereignty enforced — providers control their own infrastructure.",
      currency: "USDC",
      network: `algorand-${ALGORAND_NETWORK}`,
      caip2: CAIP2_NETWORK,
      facilitator: "https://facilitator.goplausible.xyz",
      leaderboard_tag: "x402-global-challenge",
      contact: "anthony@synergybcpacific.com",
      docs: `${APP_URL}/en/developers`,
      directory_manifest: `${DIRECTORY_API_URL}/.well-known/x402-directory.json`,
      rating_api: `${DIRECTORY_API_URL}/rate`,
      categories: CATEGORIES,
      endpoints: buildEndpoints(),
      agents: {
        marketplace_url: `${APP_URL}/en/agents`,
        api_base: process.env.AGENTS_SERVICE_URL ?? null,
        catalogue: buildAgentCatalogue(),
      },
      trust_tiers: {
        bronze: "Identity verified — institutional email, registry, wallet, contact",
        silver: "Community verified — 3+ wallet-signed upvotes from verified buyers",
        gold: "Peer reviewed — DOI verified against CrossRef, COI declaration published",
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
