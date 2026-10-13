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

// PR #147 — pilot-endpoint's own domain, so its 9 paid routes (previously
// absent from every discovery manifest) can be listed here too alongside
// directory-api's. Same wallet (AVM_ADDRESS, confirmed identical to
// directory-api's), different host — pilot-endpoint has no Next.js runtime
// of its own to serve this manifest from, so it's mirrored here as well as
// in its own apps/pilot-endpoint/.well-known/x402 (PR #147 Part 2).
const PILOT_ENDPOINT_URL = "https://pdc-pilot-endpoint.synergyblockchaintf.workers.dev";

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
  /** x402 Bazaar discovery metadata (PR #147) — up to 5 relevant tags per endpoint. */
  tags: string[];
  serviceName: string;
  iconUrl: string;
}

// PR #147 — every entry below shares the same service identity and icon;
// declared once rather than repeated 32 times. ICON_URL points at the real
// logo asset (apps/web/public/images/sbp-logo.png) — the same file
// apps/directory-api/src/routes/branding.ts already uses for its own
// og:image, not a nonexistent /og-image.png.
const SERVICE_NAME = "Pacific Data Commons";
const ICON_URL = `${APP_URL}/images/sbp-logo.png`;

/**
 * Wallet addresses are read from environment variables only, never
 * hardcoded (CLAUDE.md P4 / §18). An endpoint whose payTo wallet env var
 * isn't set is omitted from the manifest entirely — same "don't fabricate
 * an address" posture as NEXT_PUBLIC_SBP_UPLOAD_FEE_WALLET and
 * NEXT_PUBLIC_SBP_PAYTO_ADDRESS elsewhere in apps/web/.env.example.
 */
function buildEndpoints(): ManifestEndpoint[] {
  const endpoints: ManifestEndpoint[] = [];

  // 2026-10-13 wallet consolidation: the dedicated pilot-earnings wallet
  // (formerly PDC_PILOT_EARNINGS_WALLET) is retired. These endpoints now
  // pay to the same canonical AVM_ADDRESS wallet as every other route in
  // this manifest (directoryWallet below) — kept as a separate variable
  // here only because this file's two push() blocks aren't merged.
  const pilotEarningsWallet = process.env.AVM_ADDRESS ?? "";
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
        tags: ["pacific", "samoa", "finance", "cpi", "inflation"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
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
        tags: ["pacific", "climate", "ocean", "sst", "open-meteo"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
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
        tags: ["pacific", "samoa", "finance", "gdp", "economy"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/finance/fiji-gdp",
        full_url: `${DIRECTORY_API_URL}/finance/fiji-gdp`,
        price_usdc: "0.01",
        description:
          "Fiji GDP by industry (FBoS Release No. 62, GDP rebased to 2019 base). Requires ?year= (2019-2024). Industry-level breakdown published only for 2019 — see the response's own detail_level field. Source: Fiji Bureau of Statistics.",
        category: "financial_flows",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "fiji", "finance", "gdp", "economy"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
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
        tags: ["pacific", "finance", "dex", "algorand", "arbitrage"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
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
        tags: ["pacific", "finance", "remittance", "algorand", "crypto"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
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
        tags: ["pacific", "fisheries", "tuna", "wcpfc", "catch"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
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
        tags: ["pacific", "climate", "ocean", "forecast", "hycom"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
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
        tags: ["pacific", "climate", "coral", "noaa", "reef"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      // Four endpoints added since this file was first written (git log:
      // fiji-cpi, pacific-sea-level, pacific-enso-index, and
      // pacific-cyclone-history all landed after this manifest's initial
      // build) — same payToAddress pattern in directory-api/routeSchemas.ts
      // (now AVM_ADDRESS), so they belong in this same block.
      {
        path: "/finance/fiji-cpi",
        full_url: `${DIRECTORY_API_URL}/finance/fiji-cpi`,
        price_usdc: "0.01",
        description:
          "Fiji Consumer Price Index, transcribed from Fiji Bureau of Statistics' monthly CPI press releases. Optional ?year=, ?from=/?to= (YYYY-MM range).",
        category: "financial_flows",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "fiji", "finance", "cpi", "inflation"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/climate/pacific-cyclone-history",
        full_url: `${DIRECTORY_API_URL}/climate/pacific-cyclone-history`,
        price_usdc: "0.05",
        description:
          "Historical tropical cyclone tracks for the South Pacific basin, 1960-present (IBTrACS v04r01, NOAA/NCEI public domain). 851 storms indexed — peak wind, pressure, landfall, category, affected nations.",
        category: "disaster_risk",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "climate", "cyclone", "disaster-risk", "ibtracs"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/climate/pacific-sea-level",
        full_url: `${DIRECTORY_API_URL}/climate/pacific-sea-level`,
        price_usdc: "0.15",
        description:
          "Pacific sea level monitoring — monthly mean sea level for 8 UHSLC tide gauge stations across Samoa, Fiji, Tonga, Vanuatu, Solomon Islands, Kiribati, Tuvalu, and Papua New Guinea.",
        category: "climate",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "climate", "sea-level", "uhslc", "ocean"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/climate/pacific-enso-index",
        full_url: `${DIRECTORY_API_URL}/climate/pacific-enso-index`,
        price_usdc: "0.05",
        description:
          "Pacific ENSO / El Nino index (MEI.v2), bimonthly values 1979-present (NOAA PSL, public domain). Positive = El Nino, negative = La Nina conditions.",
        category: "climate",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "climate", "enso", "ocean", "noaa"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      // PR #151 — three new first-party endpoints live on GoPlausible Bazaar
      // as of 2026-10-13. All at $0.01, same AVM_ADDRESS wallet.
      {
        path: "/finance/pacific-gdp",
        full_url: `${DIRECTORY_API_URL}/finance/pacific-gdp`,
        price_usdc: "0.01",
        description:
          "Pacific GDP — annual GDP (current USD) for 6 nations: Samoa, Fiji, Tonga, Vanuatu, Solomon Islands, Papua New Guinea. World Bank Open Data (NY.GDP.MKTP.CD).",
        category: "financial_flows",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "finance", "gdp", "economy", "world-bank"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/demographics/pacific-population",
        full_url: `${DIRECTORY_API_URL}/demographics/pacific-population`,
        price_usdc: "0.01",
        description:
          "Pacific Population — annual total population for 6 nations: Samoa, Fiji, Tonga, Vanuatu, Solomon Islands, Papua New Guinea. World Bank Open Data (SP.POP.TOTL).",
        category: "demographics",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "demographics", "population", "world-bank", "census"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/finance/pacific-cpi",
        full_url: `${DIRECTORY_API_URL}/finance/pacific-cpi`,
        price_usdc: "0.01",
        description:
          "Pacific CPI & Inflation — annual CPI and inflation rate for 6 nations: Samoa, Fiji, Tonga, Vanuatu, Solomon Islands, Papua New Guinea. Pacific Community (SPC) SDMX data service (DF_CPI).",
        category: "financial_flows",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "finance", "cpi", "inflation", "spc"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      // PR #147 Part 1b — pilot-endpoint's 9 paid routes, previously absent
      // from every discovery manifest (23 + 9 = 32 total entries). Same
      // pilotEarningsWallet (= AVM_ADDRESS, confirmed identical to
      // pilot-endpoint's own wallet), different host — see
      // PILOT_ENDPOINT_URL above. Also mirrored in pilot-endpoint's own
      // /.well-known/x402 (Part 2) for crawlers that hit that domain
      // directly.
      {
        path: "/summary",
        full_url: `${PILOT_ENDPOINT_URL}/summary`,
        price_usdc: "0.01",
        description: "Pacific tuna fisheries stock-status summary — species coverage, zones, key findings. Synthetic demo dataset.",
        category: "fisheries",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "fisheries", "tuna", "stock-assessment", "demo"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/slice",
        full_url: `${PILOT_ENDPOINT_URL}/slice`,
        price_usdc: "0.50",
        description: "Filtered tuna data slice by species/year/zone. Synthetic demo dataset.",
        category: "fisheries",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "fisheries", "tuna", "filtered", "demo"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/full",
        full_url: `${PILOT_ENDPOINT_URL}/full`,
        price_usdc: "25.00",
        description: "Complete synthetic tuna dataset — all records, species, years, zones.",
        category: "fisheries",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "fisheries", "tuna", "dataset", "demo"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/expert",
        full_url: `${PILOT_ENDPOINT_URL}/expert`,
        price_usdc: "200.00",
        description: "Full tuna dataset plus methodology notes and citation-ready stock assessment interpretation.",
        category: "fisheries",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "fisheries", "tuna", "methodology", "demo"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/commission",
        full_url: `${PILOT_ENDPOINT_URL}/commission`,
        price_usdc: "1000.00",
        description: "Custom commissioned Pacific fisheries analysis — payment confirms your request; SBP follows up within 48 hours.",
        category: "fisheries",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "fisheries", "custom", "commission", "analysis"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/research/law-before-code",
        full_url: `${PILOT_ENDPOINT_URL}/research/law-before-code`,
        price_usdc: "0.01",
        description: 'Structured metadata for "Law Before Code" — Samoa digital public infrastructure governance sequencing. Abstract, policy gaps, citation.',
        category: "governance",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "governance", "policy", "samoa", "digital-infrastructure"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/research/cryptographic-continuity",
        full_url: `${PILOT_ENDPOINT_URL}/research/cryptographic-continuity`,
        price_usdc: "0.01",
        description: 'Structured metadata for "Cryptographic Continuity" — why Pacific digital infrastructure requires a standing security mandate. Abstract, incidents, citation.',
        category: "governance",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "governance", "security", "cryptography", "policy"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/research/invisible-infrastructure",
        full_url: `${PILOT_ENDPOINT_URL}/research/invisible-infrastructure`,
        price_usdc: "0.01",
        description: "Structured metadata for the third SBP working paper — fraudulent schemes, DLT-based standards, policy gaps, recommendations, citation.",
        category: "governance",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "governance", "dlt", "fraud", "standards"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/pacific/blockchain-adoption",
        full_url: `${PILOT_ENDPOINT_URL}/pacific/blockchain-adoption`,
        price_usdc: "0.01",
        description: "Pacific Blockchain and Digital Asset Adoption Landscape — regulatory sandboxes, CBDC research, digital economy strategies by nation.",
        category: "governance",
        pay_to: pilotEarningsWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "blockchain", "adoption", "cbdc", "digital-economy"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
    );
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      "x402_wellknown_manifest: AVM_ADDRESS is not set — omitting samoa-cpi, ocean-temperature, samoa-gdp, fiji-gdp, purse-seine, ocean-forecast, coral-bleaching, arbitrage-signals, remittance-corridors, fiji-cpi, pacific-cyclone-history, pacific-sea-level, pacific-enso-index, pacific-gdp, pacific-population, pacific-cpi, and the 9 pilot-endpoint routes from the discovery manifest",
    );
  }

  // directory-api's own $0.01 directory search, payTo'd to its AVM_ADDRESS
  // wallet. apps/web is a separate service with its own env vars, so this
  // must be kept equal to directory-api's AVM_ADDRESS value.
  const directoryWallet = process.env.AVM_ADDRESS;
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
        tags: ["pacific", "directory", "search", "discovery", "metadata"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        // directory-api/src/routeSchemas.ts declares no payToAddress for
        // this route, so PdcPaymentGate falls back to its constructor
        // default (env.AVM_ADDRESS) — the same wallet as /search above and,
        // since the 2026-10-13 consolidation, every route in this manifest.
        // Mirrored here via AVM_ADDRESS per this route's no-hardcoding
        // requirement (CLAUDE.md P4/§18).
        path: "/finance/fx",
        full_url: `${DIRECTORY_API_URL}/finance/fx`,
        price_usdc: "0.001",
        description:
          "Pacific FX Registry: all 8 Pacific island currencies (WST, FJD, PGK, TOP, VUV, SBD, XPF, KHR) plus 10 major sender currencies, ALGO, and USDC. Optional ?base=, ?pairs=, ?pacific_only=true, or conversion via ?from=&to=&amount=.",
        category: "financial_flows",
        pay_to: directoryWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "finance", "fx", "currency", "algorand"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      // Moved here from the pilotEarningsWallet block above — canary run
      // (2026-10-12) confirmed this route actually pays out to the
      // directory wallet (directory-api/routeSchemas.ts's payToAddress was
      // wrong and fixed the same day). This is a directory-service
      // endpoint (NOAA CO-OPS wrapper), not a dedicated pilot provider,
      // same category as /search and /finance/fx. (2026-10-13: both blocks
      // now resolve to the same AVM_ADDRESS wallet regardless.)
      {
        path: "/climate/pacific-ocean-temp",
        full_url: `${DIRECTORY_API_URL}/climate/pacific-ocean-temp`,
        price_usdc: "0.01",
        description:
          "Live water temperature at a NOAA CO-OPS Pacific tide station (Pago Pago, American Samoa or Honolulu, Hawaii). Primary-source US federal station reading — see the response's own attribution field.",
        category: "climate",
        pay_to: directoryWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "climate", "ocean", "temperature", "noaa"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/finance/crypto-rates",
        full_url: `${DIRECTORY_API_URL}/finance/crypto-rates`,
        price_usdc: "0.01",
        description: "Real-time prices for 67 curated crypto tokens, Pacific-priority weighted (ALGO, XRP, XLM). CoinGecko source.",
        category: "financial_flows",
        pay_to: directoryWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "finance", "crypto", "algorand", "coingecko"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      // Six endpoints added since this file was first written. All six
      // have no `payToAddress` override in directory-api/routeSchemas.ts,
      // so PdcPaymentGate falls back to its constructor default
      // (env.AVM_ADDRESS) — the same wallet as /search and /finance/fx, and,
      // since the 2026-10-13 consolidation, every route in this manifest.
      {
        path: "/finance/crypto-history",
        full_url: `${DIRECTORY_API_URL}/finance/crypto-history`,
        price_usdc: "0.01",
        description:
          "Historical price points for 7 KV-tracked crypto symbols (ALGO, BTC, ETH, XRP, XLM, USDC, USDT), windowed by timeframe. Required ?symbol=.",
        category: "financial_flows",
        pay_to: directoryWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "finance", "crypto", "algorand", "history"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/algorand/wallet-balance",
        full_url: `${DIRECTORY_API_URL}/algorand/wallet-balance`,
        price_usdc: "0.005",
        description:
          "Algorand wallet balance lookup — ALGO balance, USDC balance, USDC opt-in status, and account existence for any Algorand address. Nodely primary, AlgoNode fallback.",
        category: "other",
        pay_to: directoryWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["algorand", "wallet", "balance", "usdc", "blockchain"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/intelligence/pacific-brief",
        full_url: `${DIRECTORY_API_URL}/intelligence/pacific-brief`,
        price_usdc: "0.05",
        description:
          "Pacific Intelligence Orchestrator: autonomously pays 3 live PDC sub-endpoints via x402, then synthesises a structured intelligence brief using Claude. One payment triggers multiple sub-payments on Algorand Mainnet.",
        category: "other",
        pay_to: directoryWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "intelligence", "orchestrator", "claude", "brief"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/pacific/events",
        full_url: `${DIRECTORY_API_URL}/pacific/events`,
        price_usdc: "0.002",
        description:
          "Upcoming Pacific Island events — festivals, concerts, sporting events, cultural celebrations, national days. Filter by country, days ahead, and category.",
        category: "tourism",
        pay_to: directoryWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "tourism", "events", "culture", "festivals"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/pacific/weather",
        full_url: `${DIRECTORY_API_URL}/pacific/weather`,
        price_usdc: "0.002",
        description:
          "Real-time weather and 7-day forecast for Pacific Island destinations, with daily tourism ratings. Open-Meteo (ECMWF model) source, updated hourly.",
        category: "tourism",
        pay_to: directoryWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "tourism", "weather", "forecast", "open-meteo"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
      {
        path: "/intelligence/pacific-travel",
        full_url: `${DIRECTORY_API_URL}/intelligence/pacific-travel`,
        price_usdc: "0.1",
        description:
          "Pacific Travel Intelligence Orchestrator: autonomously queries events, exchange rates, weather, tourism statistics, and marine conditions, then synthesises a travel intelligence brief using Claude.",
        category: "tourism",
        pay_to: directoryWallet,
        trust_tier: "bronze",
        data_format: "json",
        tags: ["pacific", "tourism", "intelligence", "travel", "orchestrator"],
        serviceName: SERVICE_NAME,
        iconUrl: ICON_URL,
      },
    );
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      "x402_wellknown_manifest: AVM_ADDRESS is not set — omitting /search, /finance/fx, /climate/pacific-ocean-temp, /finance/crypto-rates, /finance/crypto-history, /algorand/wallet-balance, /intelligence/pacific-brief, /pacific/events, /pacific/weather, and /intelligence/pacific-travel from the discovery manifest",
    );
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
