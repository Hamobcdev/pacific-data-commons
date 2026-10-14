import { declareDiscoveryExtension } from "@x402-avm/extensions";

/**
 * Extracted from app.ts's createApp() (same fix/session as
 * apps/pilot-endpoint/src/routeSchemas.ts — see that file's doc comment and
 * packages/pdc-x402-adapter/src/bazaarAjvWorkersLogFilter.ts for the full
 * root-cause writeup) so the bazaar discovery schema each paid route
 * registers can be exercised directly in a Node test
 * (routeSchemas.test.ts calls ajv.compile() on each one) without booting the
 * whole app. Env-independent by construction, so moving it out of
 * createApp() changes nothing about runtime behaviour.
 */

// Session 29 — priced below the standard directory query fee: this is a
// high-volume utility for the broader Algorand developer community (not a
// Pacific-domain lookup), meant to attract organic x402 traffic and
// leaderboard volume from agents that have never queried PDC before.
const WALLET_BALANCE_PRICE_USDC = 0.005;

// Session 30 — priced below even the wallet-balance utility fee: FX is a
// repeat-query pattern (agents check rates multiple times per day, not
// once), so low friction per call matters more than per-call revenue for
// generating leaderboard transaction count.
const FX_PRICE_USDC = 0.001;

// Session 31 — Pacific Intelligence Orchestrator. Priced well above its own
// ~$0.016 in sub-endpoint payments (fisheries $0.01 + fx $0.001 +
// wallet-balance $0.005) plus Claude synthesis cost, so the spread is real
// margin, not just cost pass-through (CLAUDE.md Section 19, Model F).
const PACIFIC_BRIEF_PRICE_USDC = 0.05;

// Session 32 — Pacific Events discovery. Priced at the same tier as a
// single directory search result but below the standard $0.01 directory
// fee: events data is a narrow, high-frequency lookup (an agent or booking
// platform may poll it often for a given destination), same low-friction
// reasoning as FX_PRICE_USDC above.
const EVENTS_PRICE_USDC = 0.002;

// Session 34 — Pacific Weather. Same pricing tier and reasoning as
// EVENTS_PRICE_USDC: a narrow, high-frequency lookup an agent or booking
// platform may poll often for a given destination.
const WEATHER_PRICE_USDC = 0.002;

// Session 32 — Pacific Tourism Orchestrator, the live demonstration behind
// SBP's Samoa Tourism Authority proposal. Priced well above its own
// ~$0.015 in sub-endpoint payments (events $0.002 + fx $0.001 + fisheries
// $0.01 + weather $0.002, Session 34 — tourism stats is a direct Supabase
// read, no x402 payment) plus Claude synthesis cost, same margin reasoning
// as PACIFIC_BRIEF_PRICE_USDC above.
const PACIFIC_TRAVEL_PRICE_USDC = 0.1;

// Decision 60 — first-party open-data utility endpoints (Decision 59's
// class) are Tier 1 capped, same reasoning Decision 42 uses for research/
// governance endpoints (open underlying source -> cap price low) but its
// own decision rather than stretching 42's literal scope indefinitely.
// Same numeric value as DIRECTORY_QUERY_PRICE_USDC (app.ts) but declared
// explicitly here so the Decision 60 reasoning is documented at the route
// it actually applies to.
// Exported (not module-private like this file's other price constants) —
// the Agent Dataset Gateway's POST /api/v1/datasets/samoa-cpi/query adapter
// (lib/agentDatasetCatalog.ts, routes/agentDatasetGateway.ts) reuses this
// exact value as its own paidRoutes entry's priceUsdc below, so the
// gateway's pass-through price can never drift from this route's price.
export const SAMOA_CPI_PRICE_USDC = 0.01;

// Decision 59/60 — same Tier 1 cap, first-party wrappers over genuinely
// open (no-auth, free) aggregator APIs: World Bank Open Data (GDP,
// population) and SPC's SDMX data service (CPI/inflation). All three
// confirmed live 2026-10-13 before writing the services behind them —
// see worldBankPacificGdpService.ts / worldBankPacificPopulationService.ts
// / spcPacificCpiService.ts for the full sourcing doc comments.
const PACIFIC_GDP_PRICE_USDC = 0.01;
const PACIFIC_POPULATION_PRICE_USDC = 0.01;
const PACIFIC_CPI_PRICE_USDC = 0.01;

// Decision 61 — Pacific Data Registry first-party regulatory intelligence
// endpoints. Curated, structured data compiled from SIFA Act, MCIL registry,
// and EU/FATF/OECD compliance sources — PDC sells the agent-ready layer.
// Priced at Decision 60 Tier 1 cap ($0.01 USDC) as the safe default.
// Repricing above this cap requires a formal Decision Register entry noting
// that these Decision 61 endpoints (curated layer, not a live open API
// wrapper) may warrant a different price ceiling than pure Decision 59/60
// open-API wrappers. Do not change this constant without that decision.
const SIFA_REGULATORY_PRICE_USDC = 0.01;

// Same Decision 60 reasoning as SAMOA_CPI_PRICE_USDC directly above — Tier
// 1 capped, first-party wrapper over a genuinely open (no-auth) external
// source (see pacificOceanClimateService.ts's doc comment for the live
// confirmation that Open-Meteo Marine needs no key for non-commercial use).
const CLIMATE_OCEAN_TEMPERATURE_PRICE_USDC = 0.01;

// Decision 42 — governance/research endpoint over an openly-accessible
// government report (Samoa Bureau of Statistics' own published GDP
// report), Tier 1 capped, underlying document never paywalled. Not
// Decision 59/60 (that's for wrapping an already-open third-party
// aggregator API; this is PDC transcribing a government publication
// directly, same scenario Decision 42 describes). Same numeric value as
// SAMOA_CPI_PRICE_USDC, declared separately so the Decision 42 reasoning
// is documented at the route it actually applies to.
const SAMOA_GDP_PRICE_USDC = 0.01;

// Same Decision 42 reasoning as SAMOA_GDP_PRICE_USDC directly above —
// governance/research endpoint over an openly-accessible government
// report (Fiji Bureau of Statistics' own published GDP rebase release),
// Tier 1 capped, underlying document never paywalled.
const FIJI_GDP_PRICE_USDC = 0.01;

// Same Decision 42 reasoning as FIJI_GDP_PRICE_USDC/SAMOA_GDP_PRICE_USDC
// above — governance/research endpoint over openly-accessible government
// releases (Fiji Bureau of Statistics' own monthly CPI press releases),
// Tier 1 capped, underlying releases never paywalled.
const FIJI_CPI_PRICE_USDC = 0.01;

// Same Decision 60 reasoning as SAMOA_CPI_PRICE_USDC/CLIMATE_OCEAN_TEMPERATURE_PRICE_USDC
// above — Tier 1 capped, first-party wrapper over a genuinely open (no-auth)
// external source (see pacificWaterTemperatureService.ts's doc comment for
// the live confirmation that NOAA CO-OPS needs no key, and for why this
// endpoint exists instead of a Pacific Data Hub/pacificdata.org wrapper —
// that API's query-string requests are Cloudflare-challenge-gated).
const PACIFIC_WATER_TEMPERATURE_PRICE_USDC = 0.01;

// Decision 59/60 first-party wrapper over WCPFC's openly-accessible public
// THREDDS/OPeNDAP dataset. Tier 2, not Tier 1 like the other first-party
// endpoints above: this one aggregates across 5 gear-mode variables and
// the full Western/Central Pacific grid per request (multi-variable
// historical summary, not a single-value lookup) — same "priced above a
// plain Tier 1 lookup" reasoning as PACIFIC_BRIEF_PRICE_USDC, just a much
// smaller multiplier since this has no Claude synthesis cost to cover.
const PACIFIC_PURSE_SEINE_PRICE_USDC = 0.05;

// 2026-10-13 wallet consolidation: the dedicated pilot-earnings wallet
// (formerly exported here as PDC_PILOT_EARNINGS_WALLET, CZLL2VSHUW...) is
// retired. Every paid route in this file now pays to the single canonical
// AVM_ADDRESS wallet — see each route's payToAddress below.
const FIJI_CPI_PAYTO = process.env.AVM_ADDRESS ?? "";

const PACIFIC_PURSE_SEINE_PAYTO = process.env.AVM_ADDRESS ?? "";

// Decision 59/60 first-party wrapper over HYCOM's openly-accessible
// THREDDS/OPeNDAP forecast product. Tier 2, same reasoning as
// PACIFIC_PURSE_SEINE_PRICE_USDC directly above — a multi-variable
// regional-mean computation per request, not a single-value lookup.
const PACIFIC_OCEAN_FORECAST_PRICE_USDC = 0.05;

const PACIFIC_OCEAN_FORECAST_PAYTO = process.env.AVM_ADDRESS ?? "";

// Decision 59/60 first-party wrapper over NOAA Coral Reef Watch's
// openly-accessible CoralTemp product (via ERDDAP — see
// pacificCoralBleachingService.ts for why, not the THREDDS endpoint this
// route's build brief named first). Tier 2, environmental alert — same
// "multi-variable computation per request" reasoning as
// PACIFIC_OCEAN_FORECAST_PRICE_USDC above.
const PACIFIC_CORAL_BLEACHING_PRICE_USDC = 0.05;

const PACIFIC_CORAL_BLEACHING_PAYTO = process.env.AVM_ADDRESS ?? "";

// IBTrACS SP cyclone track history — $0.05, AVM_ADDRESS.
// Priced at coral-bleaching tier: static reference data with no commercial
// equivalent for the South Pacific basin. Swiss Re/RMS comparable data costs
// $0.50-$5.00/location; $0.05 is the early-adopter floor pending institutional
// buyer validation. Raise on next pricing review (Decision logged below).
const PACIFIC_CYCLONE_HISTORY_PRICE_USDC = 0.05;
const PACIFIC_CYCLONE_HISTORY_PAYTO = process.env.AVM_ADDRESS ?? "";

// Priced above the other static-bundle first-party rows ($0.05) per this
// endpoint's own build brief ($0.15) — a multi-station (8 Pacific nations),
// multi-source (two UHSLC datasets reconciled per station, see
// scripts/preprocess-sea-level.mjs) monthly aggregate, not a single-value
// lookup.
const PACIFIC_SEA_LEVEL_PRICE_USDC = 0.15;
const PACIFIC_SEA_LEVEL_PAYTO = process.env.AVM_ADDRESS ?? "";
// NOAA PSL MEI.v2 static bundle — same tier/payTo reasoning as
// PACIFIC_CYCLONE_HISTORY_PRICE_USDC directly above: static reference data,
// no live upstream refetch, same $0.05 early-adopter floor.
const PACIFIC_ENSO_INDEX_PRICE_USDC = 0.05;
const PACIFIC_ENSO_INDEX_PAYTO = process.env.AVM_ADDRESS ?? "";

// Decision 59/60 first-party wrapper over CoinGecko's openly-accessible
// free public API. Tier 1 — a high-volume single-value-per-token price
// lookup, same tier as the other first-party Tier 1 endpoints above, not
// Tier 2 like the multi-variable regional computations. $0.01 — the
// Decision 60 Tier 1 cap for first-party open-data wrappers, matching the
// other Tier 1 routes (was $0.001). The SBP dashboard is unaffected: it
// reaches this route via middleware/dashboardBypass.ts, not x402.
const PACIFIC_CRYPTO_RATES_PRICE_USDC = 0.01;

// 2026-10-13 wallet consolidation: reads the single canonical AVM_ADDRESS
// wallet — the same var directory-api's own PdcPaymentGate constructor
// default already uses (createApp() above) and the same var apps/web's
// manifest reads for this route. (Previously PDC_DIRECTORY_PAYTO_ADDRESS,
// a second name for this same wallet, now retired — see git history for
// the 2026-10-12 PDC_DIRECTORY_WALLET naming incident this replaces.)
const PACIFIC_CRYPTO_RATES_PAYTO = process.env.AVM_ADDRESS;

// Same KV-backed data as /finance/crypto-rates, just windowed into a time
// series — same tier/payTo reasoning as PACIFIC_CRYPTO_RATES_PRICE_USDC/
// PACIFIC_CRYPTO_RATES_PAYTO directly above applies identically here.
const PACIFIC_CRYPTO_HISTORY_PRICE_USDC = 0.01;
const PACIFIC_CRYPTO_HISTORY_PAYTO = process.env.AVM_ADDRESS;

// Decision 59/60 first-party wrapper over GeckoTerminal/Tinyman/Pact's
// openly-accessible public APIs (not the 4 dead sources this route's
// build brief named first — see pacificDexArbitrageService.ts for the
// full live-verification record). Tier 2 — multi-source aggregation
// (up to 5 upstream fetches per cache cycle across 7 curated pairs),
// same reasoning as the other Tier 2 first-party endpoints above.
const PACIFIC_DEX_ARBITRAGE_PRICE_USDC = 0.05;

const PACIFIC_DEX_ARBITRAGE_PAYTO = process.env.AVM_ADDRESS ?? "";

// Decision 59/60 first-party wrapper over World Bank Remittance Prices
// Worldwide (confirmed live to be entirely Cloudflare-blocked for
// server-side requests this session — see pacificRemittanceService.ts)
// plus /finance/fx's own already-x402-gated FX data, consumed internally
// in-process (not a second payment). Tier 1 — quarterly source data,
// lightweight fetch, same tier as this codebase's other Tier 1 first-party
// rows.
const PACIFIC_REMITTANCE_PRICE_USDC = 0.01;

const PACIFIC_REMITTANCE_PAYTO = process.env.AVM_ADDRESS ?? "";

// Session 24 — same discoveryFor pattern as apps/pilot-endpoint (see that
// app's routeSchemas.ts for why declareDiscoveryExtension is used directly
// rather than @x402-avm/extensions' bazaarResourceServerExtension, and why
// `method` is supplied up front). /search, /endpoint/:id, and (Session 29)
// /algorand/wallet-balance get a discovery declaration here; /provider/:id
// and /verify/:certHash remain undeclared, same as before Session 24 —
// scoped to what each session's brief actually asked for.
type DiscoveryConfig = Parameters<typeof declareDiscoveryExtension>[0] & { method: "GET" | "POST" | "HEAD" | "DELETE" | "PUT" | "PATCH" };
export function discoveryFor(config: DiscoveryConfig) {
  return declareDiscoveryExtension(config).bazaar;
}

export interface PaidRouteSpec {
  // Widened from "GET" only (Session 24 through the ENSO/crypto-rates/
  // arbitrage-signals routes above, which are all GET) to also allow
  // "POST" — the Agent Dataset Gateway's query adapter entries
  // (POST /api/v1/datasets/<id>/query) are the first paidRoutes entries
  // that take a request body rather than query params.
  method: "GET" | "POST";
  path: string;
  description: string;
  discovery?: ReturnType<typeof discoveryFor>;
  priceUsdc?: number;
  /** Overrides the gate's default payTo wallet for this route only — see PdcPaidRouteSpec.payToAddress. */
  payToAddress?: string;
}

const paidRoutesBase: PaidRouteSpec[] = [
  {
    method: "GET",
    path: "/search",
    description: "Search Pacific data endpoints by category, country, price, keywords",
    discovery: discoveryFor({
      method: "GET",
      input: { category: "fisheries", keywords: "tuna stock", country: "WS", trust_tier: "bronze", price_max: 1, time_period_start: 2020, page: 1, limit: 20 },
      inputSchema: {
        properties: {
          category: { type: "string", description: "Data category filter, e.g. fisheries, ocean, governance" },
          country: { type: "string", description: "ISO country code filter" },
          trust_tier: { type: "string", enum: ["bronze", "silver", "gold"] },
          price_max: { type: "number", description: "Maximum summary-tier price in USDC" },
          time_period_start: { type: "integer", description: "Earliest data year" },
          keywords: { type: "string", description: "Free-text search across title, description, sub-category" },
          page: { type: "integer" },
          limit: { type: "integer", description: "Max 100, default 20" },
        },
        required: [],
      },
      output: {
        example: {
          results: [{ id: "…", title: "Pacific Fisheries Status", category: "fisheries", trust_tier: "bronze" }],
          page: 1,
          limit: 20,
          totalCount: 5,
        },
      },
    }),
  },
  { method: "GET", path: "/provider/:id", description: "Full provider profile and its listed endpoints" },
  {
    method: "GET",
    path: "/endpoint/:id",
    description: "Full endpoint detail and sample response for one endpoint by its directory ID",
    discovery: discoveryFor({
      method: "GET",
      output: {
        example: {
          endpoint: { id: "…", title: "Pacific Fisheries Status — SBP Pilot Endpoint", data_category: "fisheries", endpoint_url: "https://pdcpilot-endpoint-production.up.railway.app" },
        },
      },
    }),
  },
  { method: "GET", path: "/verify/:certHash", description: "Verify a Pacific Data Protocol provenance certificate" },
  {
    method: "GET",
    path: "/algorand/wallet-balance",
    description:
      "Algorand wallet balance lookup: given any Algorand address, returns ALGO balance, USDC balance (asset 31566704), USDC opt-in status, and account existence. Nodely primary, AlgoNode fallback. Useful for counterparty checks before x402 payments.",
    priceUsdc: WALLET_BALANCE_PRICE_USDC,
    discovery: discoveryFor({
      method: "GET",
      input: { address: "ALGORAND_ADDRESS_58_CHARS" },
      inputSchema: {
        properties: {
          address: { type: "string", description: "58-character Algorand Mainnet address to check" },
        },
        required: ["address"],
      },
      output: {
        example: {
          address: "ALGORAND_ADDRESS_58_CHARS",
          exists: true,
          status: "Online",
          algo_balance: 12.5,
          usdc_balance: 100.25,
          usdc_opted_in: true,
          usdc_asset_id: 31566704,
          min_balance_algo: 0.1,
          network: "mainnet",
          queried_at: "2026-08-22T00:00:00.000Z",
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/finance/fx",
    description:
      "Pacific FX Registry: all 8 Pacific island currencies (WST, FJD, PGK, TOP, VUV, SBD, XPF, KHR) plus 10 major sender currencies (USD, AUD, NZD, EUR, GBP, JPY, CNY, SGD, CAD, HKD), ALGO, and USDC. Optional ?base=, ?pairs=, ?pacific_only=true, or conversion via ?from=&to=&amount=. AUD-pegged micro-states (Kiribati, Nauru, Tuvalu) flagged in micro_state_pegs, not fetched as separate rates. Updated daily, 24-hour cache.",
    priceUsdc: FX_PRICE_USDC,
    discovery: discoveryFor({
      method: "GET",
      input: { from: "WST", to: "USD", amount: 100 },
      inputSchema: {
        properties: {
          from: { type: "string", description: "Source currency code — optional, required together with to and amount for conversion" },
          to: { type: "string", description: "Target currency code — optional, required together with from and amount for conversion" },
          amount: { type: "number", description: "Amount to convert — optional, required together with from and to for conversion" },
          base: { type: "string", description: "Re-base all rates to this currency instead of USD — optional, ignored if from/to/amount given" },
          pairs: { type: "string", description: "Comma-separated currency codes — only these appear in rates — optional" },
          pacific_only: { type: "boolean", description: "Only Pacific island currencies (plus ALGO/USDC) in rates — optional" },
        },
        required: [],
      },
      output: {
        example: {
          base: "USD",
          timestamp: "2026-08-25T00:00:00.000Z",
          source: "currency-api",
          rates: {
            WST: 2.72,
            FJD: 2.19,
            TOP: 2.41,
            PGK: 4.44,
            SBD: 8.01,
            VUV: 118.36,
            XPF: 106.0,
            KHR: 4055.0,
            AUD: 1.4,
            NZD: 1.67,
            EUR: 0.86,
            GBP: 0.73,
            JPY: 159.1,
            CNY: 6.72,
            SGD: 1.28,
            CAD: 1.43,
            HKD: 7.85,
            ALGO: 0.092,
            USDC: 1.0,
          },
          micro_state_pegs: [
            { country: "Kiribati", currency: "AUD", note: "pegged_to_aud", peg_confirmed: true },
            { country: "Nauru", currency: "AUD", note: "pegged_to_aud", peg_confirmed: true },
            { country: "Tuvalu", currency: "AUD", note: "pegged_to_aud", peg_confirmed: true },
          ],
          data_sources: ["fawazahmed0/currency-api (jsDelivr)"],
          data_currency: "daily",
          coverage_note: "All rates sourced from fawazahmed0/currency-api, a daily-updated community-maintained feed. Rates are indicative mid-market. Not financial advice.",
          not_financial_advice: true,
          generated_at: "2026-08-25T00:00:00.000Z",
          cache_expires_at: "2026-08-26T00:00:00.000Z",
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/finance/samoa-cpi",
    description:
      "Samoa Consumer Price Index and annual inflation rate, sourced from World Bank Open Data (FP.CPI.TOTL / FP.CPI.TOTL.ZG) — not a Samoa Bureau of Statistics- or government-certified feed, see the response's own attribution field. Optional ?years= (default 15, max 60). 24-hour cache — annual data, updated at most yearly upstream.",
    priceUsdc: SAMOA_CPI_PRICE_USDC,
    payToAddress: process.env.AVM_ADDRESS ?? "",
    discovery: discoveryFor({
      method: "GET",
      input: { years: 15 },
      inputSchema: {
        properties: {
          years: { type: "integer", description: "How many most-recent years to return — optional, default 15, max 60" },
        },
        required: [],
      },
      output: {
        example: {
          country: "Samoa",
          country_iso3: "WSM",
          indicator_base_year: 2010,
          observations: [{ year: 2025, cpi_index: 149.24, inflation_pct: 2.21 }],
          latest: { year: 2025, cpi_index: 149.24, inflation_pct: 2.21 },
          world_bank_last_updated: "2026-07-13",
          attribution: {
            source: "World Bank Open Data",
            original_source: "Samoa Bureau of Statistics (as attributed by World Bank's own indicator metadata)",
            data_quality: "third_party_aggregated",
          },
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/climate/ocean-temperature",
    description:
      "Pacific sea surface temperature and wave/swell conditions, sourced from Open-Meteo's Marine Weather API — not a national meteorology-, SPC-, or fisheries-authority-certified feed, see the response's own attribution field. Requires ?country=, one of WS, FJ, TO, PG, SB, VU, CK. Returns current sea surface temperature, wave height/period/direction, ocean current velocity, and a 7-day wave forecast. 3-hour cache.",
    priceUsdc: CLIMATE_OCEAN_TEMPERATURE_PRICE_USDC,
    payToAddress: process.env.AVM_ADDRESS ?? "",
    discovery: discoveryFor({
      method: "GET",
      input: { country: "WS" },
      inputSchema: {
        properties: {
          country: { type: "string", enum: ["WS", "FJ", "TO", "PG", "SB", "VU", "CK"], description: "Pacific ISO country code — required" },
        },
        required: ["country"],
      },
      output: {
        example: {
          country_code: "WS",
          country_name: "Samoa",
          current: {
            sea_surface_temperature_c: 28.4,
            wave_height_m: 1.2,
            wave_period_s: 7.5,
            wave_direction_deg: 145,
            ocean_current_velocity_kmh: 0.8,
          },
          forecast_7_day: [{ date: "2026-09-24", wave_height_max_m: 1.4, wave_period_max_s: 8.1 }],
          week_summary: "Sea surface 28.4°C, average forecast wave height 1.3m over the next 7 days",
          queried_at: "2026-09-24T00:00:00.000Z",
          source: "open-meteo-marine",
          attribution: {
            source: "Open-Meteo Marine Weather API",
            original_source: "Open-Meteo's own blended marine forecast models (NOAA WaveWatch III / DWD ICON wave and ocean models, per Open-Meteo's published model sourcing) — not a single national meteorological, oceanographic, or fisheries authority",
            data_quality: "third_party_aggregated",
          },
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/finance/samoa-gdp",
    description:
      "Samoa GDP, expenditure approach, transcribed from the Samoa Bureau of Statistics' own published FY2025/26 report — not a third-party-aggregated feed, see the response's own attribution field. FY2025/26: real GDP -8.1%, nominal -4.7%. Optional ?fiscal_year=2025/26|2024/25 to filter to one year, or ?all=true for both. Default: latest year only. Updated at most yearly, no fixed schedule.",
    priceUsdc: SAMOA_GDP_PRICE_USDC,
    payToAddress: process.env.AVM_ADDRESS ?? "",
    discovery: discoveryFor({
      method: "GET",
      input: { fiscal_year: "2025/26" },
      inputSchema: {
        properties: {
          fiscal_year: { type: "string", enum: ["2025/26", "2024/25"], description: "Filter to one published fiscal year — optional" },
          all: { type: "boolean", description: "Return every published fiscal year instead of just the latest — optional" },
        },
        required: [],
      },
      output: {
        example: {
          country: "Samoa",
          country_iso3: "WSM",
          currency: "SAT",
          fiscal_years: [{ fiscal_year: "2025/26", gdp_nominal_sat_mil: 3619.8, gdp_real_2013_sat_mil: 2303.7, nominal_growth_pct: -4.7, real_growth_pct: -8.1 }],
          latest: { fiscal_year: "2025/26", gdp_nominal_sat_mil: 3619.8, gdp_real_2013_sat_mil: 2303.7, nominal_growth_pct: -4.7, real_growth_pct: -8.1 },
          attribution: {
            source: "Samoa Bureau of Statistics",
            source_document: "Gross Domestic Product — Expenditure Approach, FY2025/26",
            data_quality: "government_source_transcribed",
          },
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/finance/fiji-gdp",
    description:
      "Fiji GDP by industry, transcribed from the Fiji Bureau of Statistics' own published rebase release (FBoS Release No. 62, 3 Sep 2025, GDP rebased to 2019 base) — not a third-party-aggregated feed, see the response's own attribution field. Required ?year=, one of 2019-2024. Optional ?measure=nominal|real_growth, default nominal. Industry-level breakdown is published only for 2019 (the rebase base year); 2020-2024 return total GDP plus real growth rate only (2024 is preliminary) — see the response's own detail_level field.",
    priceUsdc: FIJI_GDP_PRICE_USDC,
    payToAddress: process.env.AVM_ADDRESS ?? "",
    discovery: discoveryFor({
      method: "GET",
      input: { year: "2019" },
      inputSchema: {
        properties: {
          year: { type: "string", enum: ["2019", "2020", "2021", "2022", "2023", "2024"], description: "4-digit year — required" },
          measure: { type: "string", enum: ["nominal", "real_growth"], description: "nominal (default) or real_growth — optional" },
        },
        required: ["year"],
      },
      output: {
        example: {
          nation: "FJ",
          indicator: "Gross Domestic Product by Industry",
          source_institution: "Fiji Bureau of Statistics",
          publication: "FBoS Release No. 62 — GDP Rebase 2019",
          base_year: 2019,
          unit: "FJD Millions",
          measure: "nominal",
          data: { year: "2019", detail_level: "full_industry_breakdown", preliminary: false, industries: { total: 11547.1, agriculture_forestry_fishing: 748.2 } },
          attribution: {
            source: "Fiji Bureau of Statistics",
            source_document: "Gross Domestic Product — Rebase to 2019, FBoS Release No. 62",
            data_quality: "government_source_transcribed",
          },
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/finance/fiji-cpi",
    description:
      "Fiji Consumer Price Index, transcribed from the Fiji Bureau of Statistics' own monthly CPI press releases — not a third-party-aggregated feed, see the response's own attribution field. Covers July-September 2026 (each month's own FBoS release page). Optional ?year= (4-digit), ?from=/?to= (YYYY-MM range). base_year is null — FBoS's releases state CPI weights are derived from the 2019/2020 Household Income and Expenditure Survey (HIES), not an index base period.",
    priceUsdc: FIJI_CPI_PRICE_USDC,
    payToAddress: FIJI_CPI_PAYTO,
    discovery: discoveryFor({
      method: "GET",
      input: { year: 2026 },
      inputSchema: {
        properties: {
          year: { type: "number", description: "4-digit year, e.g. 2026 — optional" },
          from: { type: "string", description: "YYYY-MM, inclusive — optional" },
          to: { type: "string", description: "YYYY-MM, inclusive — optional" },
        },
        required: [],
      },
      output: {
        example: {
          nation: "FJ",
          indicator: "Consumer Price Index",
          period: "2026-09",
          value: 117.6,
          unit: "index",
          base_year: null,
          weights_basis: "2019/2020 Household Income and Expenditure Survey (HIES)",
          month_over_month_pct: -0.4,
          year_over_year_pct: 6.8,
          annual_average_pct: 1.9,
          source_institution: "Fiji Bureau of Statistics",
          publication_date: "2026-10-01",
          release_title: "Consumer Price Index – September 2026",
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/climate/pacific-ocean-temp",
    description:
      "Live water temperature at a NOAA CO-OPS Pacific tide station, sourced from NOAA's Tides & Currents Data Getter API — a primary-source US federal station reading, not a Pacific Island national authority's own instrument, see the response's own attribution field. Optional ?station=, one of 1770000 (Pago Pago, American Samoa) or 1617760 (Honolulu, Hawaii — Pacific reference). Default 1770000. 30-minute cache.",
    priceUsdc: PACIFIC_WATER_TEMPERATURE_PRICE_USDC,
    // Canary run (2026-10-12) caught this paying out to the then-separate
    // pilot-earnings wallet — wrong wallet for this route at the time. This
    // is a directory-service endpoint (NOAA CO-OPS wrapper, no dedicated
    // pilot provider), same category as /search and /finance/fx. Moot as of
    // the 2026-10-13 consolidation: every route now pays AVM_ADDRESS anyway.
    payToAddress: process.env.AVM_ADDRESS,
    discovery: discoveryFor({
      method: "GET",
      input: { station: "1770000" },
      inputSchema: {
        properties: {
          station: { type: "string", enum: ["1770000", "1617760"], description: "NOAA CO-OPS station id — optional, default 1770000" },
        },
        required: [],
      },
      output: {
        example: {
          nation: "American Samoa",
          indicator: "sea_water_temperature",
          value: 26.4,
          unit: "celsius",
          period: "2026-10-01T15:06:00Z",
          source: "NOAA Center for Operational Oceanographic Products and Services (CO-OPS)",
          attribution: "NOAA CO-OPS / National Ocean Service — tidesandcurrents.noaa.gov",
          station_id: "1770000",
          station_name: "Pago Pago, American Samoa",
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/fisheries/pacific-purse-seine",
    description:
      "Historical annual purse seine catch for the Western and Central Pacific, sourced from WCPFC's Public Domain 1°x1° Monthly dataset via Pacific Data Hub's THREDDS server — HISTORICAL data, not real-time (WCPFC member catch reports carry a 1–2 year verification lag; dataset covers 1967–2021, see the response's own attribution and reporting_lag_note fields). Optional ?species=, one of skj, yft, bet (default skj) — albacore is not available, this purse-seine dataset has no albacore variable. Required ?year=, a 4-digit year within 1967–2021. Returns total catch in metric tonnes summed across all fishing-gear/set-type variables and the full grid. 24-hour cache.",
    priceUsdc: PACIFIC_PURSE_SEINE_PRICE_USDC,
    payToAddress: PACIFIC_PURSE_SEINE_PAYTO,
    discovery: discoveryFor({
      method: "GET",
      input: { species: "skj", year: 2020 },
      inputSchema: {
        properties: {
          species: { type: "string", enum: ["skj", "yft", "bet"], description: "Tuna species code — optional, default skj. Albacore (alb) is not available from this dataset." },
          year: { type: "integer", description: "4-digit year, 1967–2021 — required" },
        },
        required: ["year"],
      },
      output: {
        example: {
          species_code: "skj",
          common_name: "Skipjack Tuna",
          total_catch_mt: 412857.63,
          year_filter: 2020,
          year_range_covered: "1967–2021",
          data_currency: "historical",
          reporting_lag_note: "WCPFC member catch reports are verified 1–2 years after fishing year. Data reflects completed reporting cycles only.",
          record_count: 8640,
          unit: "metric_tonnes",
          attribution: "WCPFC Public Domain Aggregated Catch/Effort Data — Purse Seine 1°x1° Monthly. Western and Central Pacific Fisheries Commission. tds.pacificdata.org",
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/climate/pacific-ocean-forecast",
    description:
      "Daily Pacific Ocean surface forecast from the HYCOM GLBy0.08 Global Ocean Model, via Pacific Data Hub THREDDS. DAILY FORECAST MODEL OUTPUT, not instrument readings — data_currency is always \"daily-forecast\", see the response's own forecast_reference_date, valid_time, and attribution fields. Returns mean surface temperature, mean current speed/direction, and mean sea surface elevation for the Pacific Island region (lat -25 to 25, lon 150–220°E), each a stride-sampled regional mean — region_sample_size says how many grid cells contributed. No salinity field: this HYCOM product has no salinity variable. No query params. 6-hour cache.",
    priceUsdc: PACIFIC_OCEAN_FORECAST_PRICE_USDC,
    payToAddress: PACIFIC_OCEAN_FORECAST_PAYTO,
    discovery: discoveryFor({
      method: "GET",
      input: {},
      inputSchema: {
        properties: {},
        required: [],
      },
      output: {
        example: {
          forecast_reference_date: "2026-10-04",
          valid_time: "2026-10-04T12:00:00.000Z",
          data_currency: "daily-forecast",
          model: "HYCOM GLBy0.08 Global Ocean Model",
          region: "Pacific Island region (lat -25 to 25, lon 150–220)",
          surface_temperature_c: 27.42,
          current_speed_ms: 0.186,
          current_direction_deg: 254.3,
          sea_surface_elevation_m: 0.112,
          region_sample_size: { water_temp: 11094, water_u: 11094, water_v: 11094, surf_el: 11094 },
          attribution: "HYCOM Global Ocean Model Forecast via Pacific Data Hub THREDDS (tds.pacificdata.org/thredds). Pacific Community (SPC). Model output — not instrument readings.",
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/climate/pacific-coral-bleaching",
    description:
      "Daily coral bleaching alert levels (0-4) and degree heating weeks for a Pacific reef region, sourced from NOAA Coral Reef Watch's CoralTemp 5km daily satellite product via ERDDAP. data_currency is always \"daily\" — see the response's own observation_date, reporting_lag_note, and attribution fields. Optional ?lat= (default -13.759, Samoa), ?lon= (default -172.104), ?radius_deg= (default 2.0, 0.1–10) define the query region. bleaching_alert_level is the nearest cell NOAA reported data for; max_alert_in_region and mean_dhw are computed across region_sample_size reported cells (missing/land cells excluded, never treated as zero). 24-hour cache.",
    priceUsdc: PACIFIC_CORAL_BLEACHING_PRICE_USDC,
    payToAddress: PACIFIC_CORAL_BLEACHING_PAYTO,
    discovery: discoveryFor({
      method: "GET",
      input: { lat: -13.759, lon: -172.104, radius_deg: 2.0 },
      inputSchema: {
        properties: {
          lat: { type: "number", description: "Decimal degrees, -90..90 — optional, default -13.759 (Samoa)" },
          lon: { type: "number", description: "Decimal degrees, -180..180 — optional, default -172.104 (Samoa)" },
          radius_deg: { type: "number", description: "Bounding box half-width in degrees, 0.1..10 — optional, default 2.0" },
        },
        required: [],
      },
      output: {
        example: {
          centre_lat: -13.759,
          centre_lon: -172.104,
          radius_deg: 2.0,
          bleaching_alert_level: 0,
          bleaching_alert_label: "No Stress",
          max_alert_in_region: 1,
          mean_dhw: 0.12,
          observation_date: "2026-10-02",
          data_currency: "daily",
          reporting_lag_note: "NOAA CoralTemp updates daily with ~24h processing lag",
          attribution: "NOAA Coral Reef Watch CoralTemp 5km Daily Satellite Monitoring",
          attribution_url: "https://coralreefwatch.noaa.gov/",
          region_sample_size: 6324,
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/finance/crypto-rates",
    description:
      "Real-time prices for 67 curated crypto tokens, Pacific-priority weighted (ALGO, XRP, XLM always included). Source: CoinGecko public API. Optional ?symbols= (comma-separated, e.g. BTC,ETH,ALGO) filters to matching tokens — 400 only if every requested symbol is outside the curated list. Optional ?category= (defi|l1|l2|pacific) pre-filters by a hand-curated best-effort grouping. 60-second cache.",
    priceUsdc: PACIFIC_CRYPTO_RATES_PRICE_USDC,
    payToAddress: PACIFIC_CRYPTO_RATES_PAYTO,
    discovery: discoveryFor({
      method: "GET",
      input: { symbols: "BTC,ETH,ALGO" },
      inputSchema: {
        properties: {
          symbols: { type: "string", description: "Comma-separated symbols, case-insensitive — optional, filters to matching curated tokens" },
          category: { type: "string", enum: ["defi", "l1", "l2", "pacific"], description: "Pre-defined subset — optional" },
        },
        required: [],
      },
      output: {
        example: {
          tokens: [
            {
              symbol: "BTC",
              name: "Bitcoin",
              coingecko_id: "bitcoin",
              price_usd: 85419,
              change_24h_pct: 0.585,
              market_cap_usd: 1716350012767,
              volume_24h_usd: 14580956497,
              market_cap_rank: 1,
            },
          ],
          total_tokens: 1,
          data_currency: "real-time",
          coingecko_update_frequency: "Every ~60 seconds on CoinGecko free tier",
          attribution: "CoinGecko Public API — https://www.coingecko.com/en/api",
          pacific_priority_tokens: ["ALGO", "XRP", "XLM"],
          fetch_warnings: [],
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/finance/crypto-history",
    description:
      "Historical price points for one of the 7 KV-tracked crypto symbols (ALGO, BTC, ETH, XRP, XLM, USDC, USDT), windowed by ?tf= for the dashboard's timeframe chart selector. Required ?symbol=. Optional ?tf= (5m|15m|1h|4h|8h|1D|1W|1M, default 1D) — 1W/1M return the fullest 24h buffer available plus a note, since the KV history buffer doesn't yet hold 7/30 days. Backed by a Cloudflare Cron Trigger polling Binance (primary) or CoinCap (fallback) every 5 minutes — see /finance/crypto-rates for the live current-price equivalent. 60-second cache.",
    priceUsdc: PACIFIC_CRYPTO_HISTORY_PRICE_USDC,
    payToAddress: PACIFIC_CRYPTO_HISTORY_PAYTO,
    discovery: discoveryFor({
      method: "GET",
      input: { symbol: "ALGO", tf: "1D" },
      inputSchema: {
        properties: {
          symbol: { type: "string", enum: ["ALGO", "BTC", "ETH", "XRP", "XLM", "USDC", "USDT"], description: "Required — one of the 7 KV-tracked symbols" },
          tf: { type: "string", enum: ["5m", "15m", "1h", "4h", "8h", "1D", "1W", "1M"], description: "Optional, default 1D — window size over the history buffer" },
        },
        required: ["symbol"],
      },
      output: {
        example: {
          symbol: "ALGO",
          timeframe: "1D",
          points: [{ t: 1759600000000, p: 0.1323 }],
          point_count: 1,
          max_available_points: 288,
          note: null,
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/finance/arbitrage-signals",
    description:
      "Multi-chain DEX arbitrage signals: gross spread, gas-adjusted net spread, and signal quality (weak/moderate/strong) for 7 curated token pairs across Ethereum, Arbitrum, BNB Chain, and Algorand. Sourced from GeckoTerminal (Uniswap v2/v3/v4, SushiSwap, PancakeSwap v2/v3) and, for ALGO/USDC, Tinyman and Pact directly. Optional ?pair= (one curated pair, 400 if not curated), ?chain= (ethereum|arbitrum|bnb|polygon|algorand), ?min_spread_pct= (default 0). Not financial advice — gas estimates are approximate. 60-second cache.",
    priceUsdc: PACIFIC_DEX_ARBITRAGE_PRICE_USDC,
    payToAddress: PACIFIC_DEX_ARBITRAGE_PAYTO,
    discovery: discoveryFor({
      method: "GET",
      input: { pair: "ETH/USDC" },
      inputSchema: {
        properties: {
          pair: { type: "string", description: "One curated pair, e.g. ETH/USDC — optional, 400 if not in the curated list" },
          min_spread_pct: { type: "number", description: "Only return signals whose net_spread_pct exceeds this — optional, default 0" },
          chain: { type: "string", enum: ["ethereum", "arbitrum", "bnb", "polygon", "algorand"], description: "Filter to signals touching this chain — optional" },
        },
        required: [],
      },
      output: {
        example: {
          signals: [
            {
              pair: "ETH/USDC",
              base_token: "ETH",
              quote_token: "USDC",
              venues: [
                {
                  dex: "Uniswap v3",
                  chain: "ethereum",
                  spot_price_usd: 2700.41,
                  liquidity_usd: 98111892,
                  pool_address: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
                  base_token_decimals: 18,
                  quote_token_decimals: 6,
                  base_token_decimals_source: "registry",
                },
                {
                  dex: "Uniswap v3",
                  chain: "arbitrum",
                  spot_price_usd: 2701.34,
                  liquidity_usd: 1115038,
                  pool_address: "0xc31e54c7a869b9fcbecc14363cf510d1c41fa443",
                  base_token_decimals: 18,
                  quote_token_decimals: 6,
                  base_token_decimals_source: "registry",
                },
              ],
              best_buy_venue: "Uniswap v3 / ethereum",
              best_sell_venue: "Uniswap v3 / arbitrum",
              gross_spread_pct: 0.034,
              estimated_gas: { buy_chain: "ethereum", sell_chain: "arbitrum", buy_gas_usd: 4.2, sell_gas_usd: 0.002, total_gas_usd: 4.202 },
              net_spread_pct: -0.0082,
              signal_quality: "weak",
              is_profitable_estimated: false,
              gas_disclaimer: "Gas estimates are approximate and may differ at execution time. Verify before trading.",
              observed_at: "2026-10-04T00:00:00.000Z",
              estimated_slippage_pct: 0.204,
              thin_liquidity_warning: false,
              net_spread_after_slippage_pct: -0.2122,
              is_executable_estimated: false,
              is_cross_chain: true,
              cross_chain_note: "Cross-chain arbitrage requires pre-positioned capital on both chains or a bridge — bridge latency may exceed signal window.",
              recommended_execution_window_ms: 30000,
              mev_warning:
                "Pacific region arbitrage signals are visible to global MEV searchers. Use private mempool services (Flashbots Protect, MEV Blocker) for execution on Ethereum mainnet.",
              execution_hint: {
                buy_venue_chain: "ethereum",
                buy_dex: "Uniswap v3",
                buy_pool_address: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
                sell_venue_chain: "arbitrum",
                sell_dex: "Uniswap v3",
                sell_pool_address: "0xc31e54c7a869b9fcbecc14363cf510d1c41fa443",
                fee_tier_note: "Uniswap v3 pools have fee tiers (0.05%/0.3%/1%) — verify pool fee tier before constructing swap calldata.",
                not_financial_advice: true,
              },
              signal_age_ms: 1200,
            },
          ],
          total_pairs_monitored: 7,
          pairs_with_signal: 1,
          covered_dexs: ["Uniswap v2", "Uniswap v3", "Uniswap v4", "SushiSwap v3", "PancakeSwap v2", "PancakeSwap v3", "Tinyman", "Pact"],
          covered_chains: ["ethereum", "arbitrum", "bnb", "polygon", "algorand"],
          data_currency: "real-time",
          cache_ttl_seconds: 60,
          attribution: "PDC Arbitrage Signal Engine — aggregates Uniswap v2/v3/v4, SushiSwap, PancakeSwap v2/v3, Tinyman, and Pact. Gas: public chain RPCs, Polygon Gas Station, fixed Arbitrum/Algorand estimates. Not financial advice.",
          stage: "1",
          stage_note: "Stage 1: curated pairs only. Stage 2 will add on-demand arbitrary pair lookup.",
          gas_warnings: [],
          fetch_warnings: [],
          decimal_precision: {
            warning:
              "All prices and amounts in this response are human-readable display units. Always convert to raw on-chain integer units using token decimal precision before constructing swap transactions or smart contract calls.",
            conversion_formula: "raw_units = display_amount * 10^token_decimals (use integer arithmetic, never float — float precision loss causes transaction errors)",
            example_usdc: "1.5 USDC display → 1500000 raw units (6 decimals)",
            example_eth: "1.5 ETH display → 1500000000000000000 raw units (18 decimals)",
            token_decimals_used: { ETH: 18, USDC: 6 },
          },
          decimal_warning:
            "IMPORTANT: spot_price_usd and liquidity_usd are display units. For on-chain use apply token_decimals from decimal_precision.token_decimals_used before constructing transactions.",
          benchmark_trade_size_usd: 10000,
          benchmark_trade_note:
            "Slippage and execution estimates assume a $10,000 benchmark trade. Larger trades will experience greater slippage and may not be profitable at the indicated spread.",
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/finance/remittance-corridors",
    description:
      "Pacific remittance corridor cost comparison for 9 AU/NZ/US -> Pacific Island corridors (traditional rails via World Bank RPW, live if reachable else a Q4-2024 static fallback, vs. crypto rail network-fee estimates for XRP/XLM/ALGO), at a $200 benchmark send amount. Consumes /finance/fx internally for live cross-rates. traditional_rails.live_data/static_fallback say which source was used; traditional_rails is null (with traditional_rails_note) only if a corridor has neither. Crypto rail costs are network fees only; on/off-ramp costs are additional. Optional ?corridor=, ?min_saving_pct=, ?token=. Not financial advice. 24-hour cache.",
    priceUsdc: PACIFIC_REMITTANCE_PRICE_USDC,
    payToAddress: PACIFIC_REMITTANCE_PAYTO,
    discovery: discoveryFor({
      method: "GET",
      input: { corridor: "AUS_WST" },
      inputSchema: {
        properties: {
          corridor: { type: "string", description: "One corridor id, e.g. AUS_WST — optional, 400 if not one of the 9 curated corridors" },
          min_saving_pct: { type: "number", description: "Only return corridors where potential_saving_pct exceeds this — optional, default 0" },
          token: { type: "string", enum: ["XRP", "XLM", "ALGO"], description: "Filter crypto_rails to just this token — optional" },
        },
        required: [],
      },
      output: {
        example: {
          corridors: [
            {
              corridor_id: "AUS_WST",
              send_country: "Australia",
              send_currency: "AUD",
              receive_country: "Samoa",
              receive_currency: "WST",
              benchmark_send_amount_usd: 200,
              live_fx_rate: { rate: 1.9, pair: "AUD_to_WST", source: "currency-api", as_of: "daily" },
              traditional_rails: {
                average_cost_pct: 6.8,
                average_cost_usd: 13.6,
                cheapest_provider: "Western Union",
                cheapest_cost_pct: 4.2,
                provider_count: null,
                data_source: "World Bank RPW Q4-2024",
                data_currency: "quarterly",
                live_data: false,
                static_fallback: true,
              },
              traditional_rails_note: null,
              crypto_rails: [
                {
                  token: "XRP",
                  network_fee_usd: 0.0001,
                  fx_spread_pct_estimate: 0.02,
                  total_estimated_cost_pct: 0.02,
                  total_estimated_cost_usd: 0.04,
                  on_off_ramp_note: "Network fees only — on-ramp/off-ramp costs additional and vary by local provider",
                  not_financial_advice: true,
                },
              ],
              potential_saving_pct: 6.78,
              not_financial_advice: true,
            },
          ],
          meta: {
            benchmark_send_amount_usd: 200,
            corridors_returned: 1,
            note: "Crypto rail costs are network fees only. Local on-ramp and off-ramp costs are additional and vary by provider and country.",
            not_financial_advice: true,
            data_sources: ["World Bank Remittance Prices Worldwide", "fawazahmed0/currency-api / ExchangeRate-API / Frankfurter (ECB) — see /finance/fx", "Static crypto network fee estimates"],
          },
          fetch_warnings: ["AUS_WST: World Bank RPW live fetch unavailable this cycle — using Q4-2024 static fallback"],
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/intelligence/pacific-brief",
    description:
      "Pacific Intelligence Orchestrator: autonomously pays 3 live PDC sub-endpoints (fisheries stock summary, FX rates, Algorand wallet-balance check) via x402, then synthesises the results into a structured intelligence brief using Claude. One payment triggers multiple sub-payments settling on Algorand Mainnet. Specify topic (fisheries/marine/ocean/economic/climate/general) and country code (WS/FJ/TO/PG/SB/VU/CK/NU) to shape which findings are emphasised. Returns executive summary, key findings, data sources, synthetic-data warning, and the full sub-payment trail.",
    priceUsdc: PACIFIC_BRIEF_PRICE_USDC,
    discovery: discoveryFor({
      method: "GET",
      input: { topic: "fisheries", country: "WS" },
      inputSchema: {
        properties: {
          topic: { type: "string", enum: ["fisheries", "marine", "ocean", "economic", "climate", "general"], description: "Shapes synthesis framing — does not change which sub-endpoints are queried" },
          country: { type: "string", enum: ["WS", "FJ", "TO", "PG", "SB", "VU", "CK", "NU"], description: "Pacific ISO country code — shapes synthesis framing" },
        },
        required: [],
      },
      output: {
        example: {
          topic: "fisheries",
          country: "WS",
          executive_summary: "Synthetic demo fisheries data shows a healthy skipjack stock index alongside stable FX conditions for Samoa.",
          key_findings: ["Skipjack stock index 0.92 in the synthetic demo dataset (fisheries)", "WST/USD rate stable (finance)", "SBP payTo wallet funded and USDC opted-in (algorand)"],
          data_sources: [
            { name: "fisheries", queried_at: "2026-08-25T00:00:00.000Z", category: "fisheries" },
            { name: "fx", queried_at: "2026-08-25T00:00:00.000Z", category: "finance" },
            { name: "wallet_balance", queried_at: "2026-08-25T00:00:00.000Z", category: "algorand" },
          ],
          limitations: "Fisheries data is synthetic demonstration data, not a real stock assessment.",
          confidence: "high",
          data_warning: "SYNTHETIC DATA: This dataset demonstrates the Pacific Data Commons payment infrastructure. All values are fabricated.",
          payments: [
            { endpoint: "https://pdcpilot-endpoint-production.up.railway.app/summary", category: "fisheries", tx_id: "…", amount_usdc: 0.01 },
            { endpoint: "https://api.synergybcpacific.com/finance/fx", category: "finance", tx_id: "…", amount_usdc: 0.001 },
            { endpoint: "https://api.synergybcpacific.com/algorand/wallet-balance", category: "algorand", tx_id: "…", amount_usdc: 0.005 },
          ],
          total_sub_payments_usdc: 0.016,
          orchestrated_at: "2026-08-25T00:00:00.000Z",
          run_id: "…",
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/pacific/events",
    description:
      "Upcoming Pacific Island events: festivals, concerts, sporting events, cultural celebrations, and national days. Filter by country (WS/FJ/TO/PG/SB/VU/CK), days ahead (1-365), and category. Returns structured event data including dates, attendance, tourism impact, and booking advice. Sourced from SPTO, tourism authorities, and official event sources.",
    priceUsdc: EVENTS_PRICE_USDC,
    discovery: discoveryFor({
      method: "GET",
      input: { country: "WS", days_ahead: 90, category: "festival" },
      inputSchema: {
        properties: {
          country: { type: "string", description: "Pacific ISO country code filter — WS, FJ, TO, PG, SB, VU, CK" },
          days_ahead: { type: "integer", description: "How many days ahead to look, 1-365, default 90" },
          category: { type: "string", enum: ["festival", "concert", "sport", "cultural", "religious", "political", "business", "other"] },
        },
        required: [],
      },
      output: {
        example: {
          results: [
            {
              id: "…",
              name: "Teuila Tourism Festival",
              category: "festival",
              country_code: "WS",
              country_name: "Samoa",
              start_date: "2026-09-01",
              end_date: "2026-09-05",
              tourism_impact: "very_high",
              booking_lead_time: "2 months ahead",
            },
          ],
          count: 1,
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/pacific/weather",
    description:
      "Real-time weather and 7-day forecast for Pacific Island destinations. Returns current temperature, humidity, precipitation, wind speed, and conditions plus a 7-day forecast with daily tourism ratings (Excellent/Good/Fair/Poor). Data from Open-Meteo (ECMWF model), updated hourly. Requires country: WS (Samoa), FJ (Fiji), TO (Tonga), PG (Papua New Guinea), SB (Solomon Islands), VU (Vanuatu), CK (Cook Islands).",
    priceUsdc: WEATHER_PRICE_USDC,
    discovery: discoveryFor({
      method: "GET",
      input: { country: "WS" },
      inputSchema: {
        properties: {
          country: { type: "string", enum: ["WS", "FJ", "TO", "PG", "SB", "VU", "CK"], description: "Pacific ISO country code — required" },
        },
        required: ["country"],
      },
      output: {
        example: {
          country_code: "WS",
          country_name: "Samoa",
          current: {
            temperature_c: 25.8,
            humidity_percent: 78,
            precipitation_mm: 0,
            wind_speed_kmh: 4.3,
            conditions: "Partly cloudy",
            tourism_rating: "Excellent",
          },
          forecast_7_day: [
            { date: "2026-08-27", temp_max_c: 26.8, temp_min_c: 25.3, precipitation_mm: 0.2, conditions: "Drizzle", tourism_rating: "Excellent" },
          ],
          week_summary: "Excellent conditions — 27°C average, mostly dry",
          queried_at: "2026-08-27T00:00:00.000Z",
          source: "open-meteo",
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/intelligence/pacific-travel",
    description:
      "Pacific Travel Intelligence Orchestrator: given a destination and travel window, autonomously queries upcoming events, live exchange rates, real-time weather, tourism arrival/spend statistics, and seasonal marine conditions, then synthesises a structured travel intelligence brief using Claude. Designed for travel agents, booking platforms, and AI travel assistants. One payment triggers multiple sub-payments to Pacific data providers. Returns executive summary, upcoming events, weather, exchange rates, tourism statistics, booking advice, and the full payment trail.",
    priceUsdc: PACIFIC_TRAVEL_PRICE_USDC,
    discovery: discoveryFor({
      method: "GET",
      input: { destination: "WS", travel_window: "christmas_2026" },
      inputSchema: {
        properties: {
          destination: { type: "string", enum: ["WS", "FJ", "TO", "PG", "SB", "VU", "CK"], description: "Pacific ISO country code" },
          travel_window: { type: "string", enum: ["next_30_days", "next_90_days", "christmas_2026", "school_holidays"], description: "Shapes how far ahead events are searched — default next_90_days" },
        },
        required: ["destination"],
      },
      output: {
        example: {
          destination: "WS",
          travel_window: "christmas_2026",
          executive_summary: "Samoa's Christmas and New Year peak season overlaps favourably with excellent current weather and stable FX conditions.",
          upcoming_events: [{ name: "Samoa Christmas and New Year", dates: "2026-12-20 to 2027-01-05", impact: "very_high" }],
          seasonal_context: "Synthetic demo marine data shows stable conditions for the travel window.",
          exchange_rates: { note: "Live rates from currency-api, base USD.", key_rates: { WST: 2.72 } },
          weather: { current_conditions: "25.8°C, Partly cloudy", week_summary: "Excellent conditions — 27°C average, mostly dry", tourism_rating: "Excellent", forecast_days: 7 },
          tourism_stats: { country_code: "WS", country_name: "Samoa", year: 2023, international_arrivals: 164000, tourism_receipts_usd_millions: 180.5, avg_spend_per_visitor_usd: 1100, avg_length_stay_days: 8.5, peak_months: ["December", "January", "July", "August"], low_months: ["March", "April", "May"], source: "World Bank / Samoa Tourism Authority", data_quality: "verified" },
          booking_advice: "Book at least 3 months ahead — flights from Auckland and Sydney fill up by October.",
          data_sources: [
            { name: "events", queried_at: "2026-08-27T00:00:00.000Z", category: "events" },
            { name: "fx", queried_at: "2026-08-27T00:00:00.000Z", category: "finance" },
            { name: "fisheries", queried_at: "2026-08-27T00:00:00.000Z", category: "fisheries" },
            { name: "weather", queried_at: "2026-08-27T00:00:00.000Z", category: "weather" },
            { name: "tourism_stats", queried_at: "2026-08-27T00:00:00.000Z", category: "tourism_stats" },
          ],
          data_warning: "Only the fisheries/marine component of this brief is demonstration data — SYNTHETIC DATA: This dataset demonstrates the Pacific Data Commons payment infrastructure. All values are fabricated. All other sections (events, exchange rates, weather, tourism statistics) are live, real data.",
          confidence: "high",
          payments: [
            { endpoint: "https://api.synergybcpacific.com/pacific/events", category: "events", tx_id: "…", amount_usdc: 0.002 },
            { endpoint: "https://api.synergybcpacific.com/finance/fx", category: "finance", tx_id: "…", amount_usdc: 0.001 },
            { endpoint: "https://pdcpilot-endpoint-production.up.railway.app/summary", category: "fisheries", tx_id: "…", amount_usdc: 0.01 },
            { endpoint: "https://api.synergybcpacific.com/pacific/weather", category: "weather", tx_id: "…", amount_usdc: 0.002 },
          ],
          total_sub_payments_usdc: 0.015,
          orchestrated_at: "2026-08-27T00:00:00.000Z",
          run_id: "…",
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/climate/pacific-cyclone-history",
    description:
      "Historical tropical cyclone tracks for the South Pacific basin (1960-present), sourced from IBTrACS v04r01 (NOAA/NCEI, public domain). Returns one record per storm with peak wind (kt), minimum pressure (mb), landfall flag, category (TD/C1-C5), and affected Pacific nation codes (FJ, WS, TO, VU, SB, PF, CK, TV, KI). Optional filters: ?season= (4-digit year), ?nation= (ISO-2 code), ?min_category= (td|c1|c2|c3|c4|c5), ?landfall=true, ?limit= (default 100, max 500). 1-hour cache. 851 storms indexed.",
    priceUsdc: PACIFIC_CYCLONE_HISTORY_PRICE_USDC,
    payToAddress: PACIFIC_CYCLONE_HISTORY_PAYTO,
    discovery: discoveryFor({
      method: "GET",
      input: { nation: "WS", min_category: "c3", limit: 10 },
      inputSchema: {
        properties: {
          season: { type: "number", description: "4-digit season year, e.g. 2024 — optional" },
          nation: { type: "string", description: "ISO-2 Pacific nation code: FJ, WS, TO, VU, SB, PF, CK, TV, KI — optional" },
          min_category: { type: "string", description: "Minimum intensity: td | c1 | c2 | c3 | c4 | c5 — optional" },
          landfall: { type: "string", description: "Pass true to return only storms that made landfall — optional" },
          limit: { type: "number", description: "Max results, default 100, max 500 — optional" },
        },
        required: [],
      },
      output: {
        example: {
          id: "2024319S09187",
          name: "WINSTON",
          season: 2016,
          basin: "SP",
          start: "2016-02-07 06:00:00",
          end: "2016-02-26 00:00:00",
          peak_wind_kt: 165,
          peak_pres_mb: 884,
          landfall: true,
          cat: "C5",
          nations: ["FJ"],
          points: 74,
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/climate/pacific-sea-level",
    description:
      "Pacific sea level monitoring — monthly mean sea level (mm, relative to each station's own local reference datum) for 8 UHSLC tide gauge stations: Apia (WS), Suva (FJ), Nuku'alofa (TO), Port Vila (VU), Honiara (SB), Tarawa/Betio (KI), Funafuti (TV), Port Moresby (PG). Source: University of Hawaii Sea Level Center (UHSLC), NOAA/NCEI co-sponsored — used instead of BoM SEAFRAME, whose licensing could not be confirmed. 7 stations current through July 2026 (preliminary Fast Delivery data); Port Moresby has no current UHSLC feed and is historical only (1991-1993, Research Quality data) — see each record's own data_quality field. Not directly comparable in absolute terms between stations (different local datums). Optional filters: ?station= (name substring), ?nation= (ISO-2 code), ?from=/?to= (YYYY-MM range). 24-hour cache.",
    priceUsdc: PACIFIC_SEA_LEVEL_PRICE_USDC,
    payToAddress: PACIFIC_SEA_LEVEL_PAYTO,
    discovery: discoveryFor({
      method: "GET",
      input: { nation: "TV", from: "2026-01" },
      inputSchema: {
        properties: {
          station: { type: "string", description: "Station name substring, e.g. Funafuti — optional" },
          nation: { type: "string", description: "ISO-2 code: WS, FJ, TO, VU, SB, KI, TV, PG — optional" },
          from: { type: "string", description: "YYYY-MM, inclusive — optional" },
          to: { type: "string", description: "YYYY-MM, inclusive — optional" },
        },
        required: [],
      },
      output: {
        example: {
          nation: "TV",
          country: "Tuvalu",
          station: "Funafuti",
          uhslc_id: 25,
          period: "2026-07",
          mean_sea_level_mm: 1945.7,
          days_observed: 29,
          data_quality: "fast_delivery_preliminary",
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/climate/pacific-enso-index",
    description:
      "Pacific ENSO / El Nino index (MEI.v2) — bimonthly values 1979-present, sourced from NOAA PSL's Multivariate ENSO Index v2 (public domain). Positive values indicate El Nino conditions, negative values indicate La Nina. Each record's period approximates its bimonthly season to a single calendar month (e.g. the Dec-Jan DJ season maps to January) — see each record's own season field for the true 2-month window. Optional filters: ?year= (4-digit year), ?from=/?to= (4-digit year range), ?phase= (elnino|lanina|neutral, using the conventional +-0.5 MEI threshold). 24-hour cache. 572 records indexed.",
    priceUsdc: PACIFIC_ENSO_INDEX_PRICE_USDC,
    payToAddress: PACIFIC_ENSO_INDEX_PAYTO,
    discovery: discoveryFor({
      method: "GET",
      input: { from: 2015, to: 2016, phase: "elnino" },
      inputSchema: {
        properties: {
          year: { type: "number", description: "4-digit year, e.g. 2015 — optional" },
          from: { type: "number", description: "4-digit start year, inclusive — optional" },
          to: { type: "number", description: "4-digit end year, inclusive — optional" },
          phase: { type: "string", description: "elnino | lanina | neutral — optional" },
        },
        required: [],
      },
      output: {
        example: {
          period: "2025-12",
          phase: "elnino",
          mei_v2: 1.49,
          anomaly_c: 0.8,
          season: "2025-12 to 2026-01",
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/finance/pacific-gdp",
    description:
      "Annual GDP (current US$) for 6 Pacific Island nations — Fiji, Papua New Guinea, Solomon Islands, Tonga, Vanuatu, Samoa — sourced from World Bank Open Data, not a national-statistics-office-certified feed, see the response's own attribution field. Optional ?years= (default 15, max 60).",
    priceUsdc: PACIFIC_GDP_PRICE_USDC,
    payToAddress: process.env.AVM_ADDRESS ?? "",
    discovery: discoveryFor({
      method: "GET",
      input: { years: 15 },
      inputSchema: {
        properties: {
          years: { type: "integer", description: "How many most-recent years per country to return — optional, default 15, max 60" },
        },
        required: [],
      },
      output: {
        example: {
          countries: ["WSM", "FJI", "TON", "VUT", "SLB", "PNG"],
          observations: [{ country_iso3: "FJI", country_name: "Fiji", year: 2025, gdp_current_usd: 6198013062.07 }],
          latest_by_country: { FJI: { country_iso3: "FJI", country_name: "Fiji", year: 2025, gdp_current_usd: 6198013062.07 } },
          attribution: {
            source: "World Bank Open Data",
            original_source: "National statistics offices of each listed country, as compiled by the World Bank",
            data_quality: "third_party_aggregated",
          },
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/demographics/pacific-population",
    description:
      "Annual total population for 6 Pacific Island nations — Fiji, Papua New Guinea, Solomon Islands, Tonga, Vanuatu, Samoa — sourced from World Bank Open Data, not a national-statistics-office-certified feed, see the response's own attribution field. Optional ?years= (default 10, max 60).",
    priceUsdc: PACIFIC_POPULATION_PRICE_USDC,
    payToAddress: process.env.AVM_ADDRESS ?? "",
    discovery: discoveryFor({
      method: "GET",
      input: { years: 10 },
      inputSchema: {
        properties: {
          years: { type: "integer", description: "How many most-recent years per country to return — optional, default 10, max 60" },
        },
        required: [],
      },
      output: {
        example: {
          countries: ["WSM", "FJI", "TON", "VUT", "SLB", "PNG"],
          observations: [{ country_iso3: "FJI", country_name: "Fiji", year: 2025, population_total: 933154 }],
          latest_by_country: { FJI: { country_iso3: "FJI", country_name: "Fiji", year: 2025, population_total: 933154 } },
          attribution: {
            source: "World Bank Open Data",
            original_source: "National statistics offices of each listed country, as compiled by the World Bank",
            data_quality: "third_party_aggregated",
          },
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/finance/pacific-cpi",
    description:
      "Consumer Price Index and inflation rate for 6 Pacific Island nations — Fiji, Papua New Guinea, Solomon Islands, Tonga, Vanuatu, Samoa — sourced from the Pacific Community (SPC)'s SDMX data service, not a national-statistics-office-certified feed, see the response's own attribution field. Annual, 2016-present.",
    priceUsdc: PACIFIC_CPI_PRICE_USDC,
    payToAddress: process.env.AVM_ADDRESS ?? "",
    discovery: discoveryFor({
      method: "GET",
      output: {
        example: {
          countries: ["Fiji", "Papua New Guinea", "Solomon Islands", "Tonga", "Vanuatu", "Samoa"],
          observations: [{ country_iso2: "FJ", country_name: "Fiji", year: 2025, indicator: "inflation_rate_pct", value: 2.3 }],
          attribution: {
            source: "Pacific Community (SPC) — SDMX data service",
            original_source: "National statistics offices of each listed country, as compiled by SPC",
            data_quality: "third_party_aggregated",
          },
        },
      },
    }),
  },
  // ─── SIFA Regulatory Intelligence Endpoints ──────────────────────────────
  // Decision 61 — Pacific Data Registry first-party curated regulatory layer.
  // Priced at SIFA_REGULATORY_PRICE_USDC ($0.01, Decision 60 safe default).
  {
    method: "GET",
    path: "/pacific/samoa-entity-setup",
    description:
      "Samoa international entity formation requirements — structured regulatory intelligence for IBC, international trust, foundation, international banking licence, insurance, partnership, and mutual fund structures. Includes director/shareholder requirements, minimum capital, tax treatment, UBO disclosure obligations, formation timeline, and typical fee ranges. Query param: entity_type (ibc|trust|foundation|international_bank|insurance|partnership|mutual_fund|all). Source: SIFA Act 2005, International Companies Act 1987.",
    priceUsdc: SIFA_REGULATORY_PRICE_USDC,
    payToAddress: process.env.AVM_ADDRESS ?? "",
    discovery: discoveryFor({
      method: "GET",
      output: {
        example: {
          query: { entity_type: "ibc" },
          results: [{
            entity_type: "ibc",
            entity_type_label: "International Business Company (IBC)",
            governing_legislation: "International Companies Act 1987",
            minimum_shareholders: 1,
            minimum_directors: 1,
            minimum_paid_up_capital_usd: null,
            ubo_disclosure_threshold_pct: 25,
            ubo_disclosure_public: false,
            tax_treatment: "Zero tax on income earned outside Samoa",
            formation_timeline_typical: "1–3 business days",
            annual_fee_usd_approx: 300,
          }],
          aml_cfct_mandatory_notice: "MANDATORY: All entity types require UBO disclosure of any beneficial owner with ≥25% interest to the Financial Intelligence Unit (FIU) Samoa.",
          attribution: { source: "SIFA", source_url: "https://www.sifa.ws" },
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/pacific/samoa-compliance-status",
    description:
      "Samoa's current regulatory compliance status across EU, FATF, OECD, and TIEA networks — structured for AI due diligence agents. Includes EU blacklist status (removed 17 February 2026), FATF APG membership and mutual evaluation, OECD Global Forum peer review rating (Largely Compliant), TIEA partner network count and key partners, AML/CFT legislative framework, FIU Samoa details, and SIFA overview. Returns a structured due_diligence_signal (low_risk/medium_risk/high_risk) field for programmatic use.",
    priceUsdc: SIFA_REGULATORY_PRICE_USDC,
    payToAddress: process.env.AVM_ADDRESS ?? "",
    discovery: discoveryFor({
      method: "GET",
      output: {
        example: {
          compliance_status: {
            jurisdiction: "Samoa (Independent State of)",
            iso_code: "WS",
            eu_blacklist: { status: "not_listed", removed_from_list_date: "2026-02-17" },
            fatf_status: { status: "compliant" },
            oecd_peer_review: { rating: "Largely Compliant" },
            due_diligence_signal: "low_risk",
          },
          summary: "Samoa (WS) presents a LOW RISK regulatory profile as of October 2026.",
          attribution: { source: "SIFA", source_url: "https://www.sifa.ws" },
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/pacific/samoa-service-providers",
    description:
      "Directory of all SIFA-licensed trustee companies in Samoa — the 9 licensed registered agents required by law for any Samoa international entity formation. Includes name, address, phone, website (where available), and specialisation for each provider. Disclosure: SBP has a commercial referral relationship with Pacific Fiduciaries (Samoa) Limited, which is listed neutrally alongside all other SIFA-licensed providers; this relationship is disclosed at pdc.synergybcpacific.com/disclosures.",
    priceUsdc: SIFA_REGULATORY_PRICE_USDC,
    payToAddress: process.env.AVM_ADDRESS ?? "",
    discovery: discoveryFor({
      method: "GET",
      output: {
        example: {
          jurisdiction: "Samoa",
          regulator: "SIFA",
          total_licensed_trustee_companies: 9,
          providers: [{ name: "Pacific Fiduciaries (Samoa) Limited", address: "Le Sanalele Complex, Vaea Street, Apia", phone: "+685 29067" }],
          attribution: { source: "SIFA", source_url: "https://www.sifa.ws" },
        },
      },
    }),
  },
  {
    method: "GET",
    path: "/pacific/samoa-banking-setup",
    description:
      "Samoa International Banking Licence requirements under the International Banking Act 2005 — USD 1M minimum capital, director qualifications, full MLPA 2007-compliant AML/CFT programme, SIFA fit-and-proper assessment process, 8-step application timeline (3–6 months total), annual obligations, and permitted vs restricted activities. Includes specific CBS consultation note for USDC and digital asset banking activities.",
    priceUsdc: SIFA_REGULATORY_PRICE_USDC,
    payToAddress: process.env.AVM_ADDRESS ?? "",
    discovery: discoveryFor({
      method: "GET",
      output: {
        example: {
          banking_setup: {
            licence_type: "International Banking Licence",
            minimum_paid_up_capital_usd: 1000000,
            minimum_directors: 2,
            application_process: { total_timeline_estimate: "3–6 months from initial engagement of registered agent" },
            cbdc_digital_asset_note: "USDC and other digital asset activities require CBS written position before launch.",
          },
          executive_summary: "An International Banking Licence from SIFA requires USD 1,000,000 minimum paid-up capital.",
          attribution: { source: "SIFA", source_url: "https://www.sifa.ws" },
        },
      },
    }),
  },
];

/**
 * Stream A — Agent Dataset Gateway (CLAUDE.md Decision 61) per-dataset
 * pricing fix. Hono's own route handler (routes/agentDatasetGateway.ts)
 * still uses one dynamic "POST /api/v1/datasets/:id/query" path — that's
 * unrelated and unchanged. This is about what the PAYMENT GATE charges:
 * it used to register that literal ":id" pattern as a SINGLE paidRoutes
 * entry priced at SAMOA_CPI_PRICE_USDC flat, so an agent querying
 * pacific-sea-level through the gateway was charged $0.01 instead of its
 * real $0.15 — found during Stream A Session 3 review, fixed here.
 *
 * Since @x402/core's route matching is regex-based per literal pattern
 * (confirmed in node_modules/.pnpm/@x402+core.../server/index.js's
 * parseRoutePattern — a literal path compiles to an exact-match regex,
 * same as every other paidRoutes entry above), registering one literal
 * route per dataset id — rather than teaching the payment gate a dynamic
 * per-request price resolver — is the fix that fits this app's existing
 * architecture with no changes to app.ts's addRoute() loop or to
 * @pdc/x402-adapter at all. Each entry reuses its OWN dataset's direct
 * GET route's price/wallet (looked up by path in paidRoutesBase above),
 * so it can never drift from what that same dataset costs directly.
 *
 * AGENT_DATASET_GATEWAY_DIRECT_PATHS must mirror
 * lib/agentDatasetCatalog.ts's DATASET_METADATA keys exactly. It's
 * necessarily a second list, not an import of the first: agentDatasetCatalog.ts
 * already imports `paidRoutes` from this file, so this file importing
 * back from agentDatasetCatalog.ts would be circular.
 * __tests__/routeSchemas.test.ts's "Agent Dataset Gateway pricing"
 * suite cross-checks the two lists stay in sync.
 */
const AGENT_DATASET_GATEWAY_DIRECT_PATHS: readonly string[] = [
  "/finance/fx",
  "/finance/samoa-cpi",
  "/finance/samoa-gdp",
  "/finance/fiji-gdp",
  "/finance/fiji-cpi",
  "/finance/crypto-rates",
  "/finance/crypto-history",
  "/finance/arbitrage-signals",
  "/finance/remittance-corridors",
  "/climate/ocean-temperature",
  "/climate/pacific-ocean-temp",
  "/climate/pacific-ocean-forecast",
  "/climate/pacific-coral-bleaching",
  "/climate/pacific-cyclone-history",
  "/climate/pacific-sea-level",
  "/climate/pacific-enso-index",
  "/fisheries/pacific-purse-seine",
  "/intelligence/pacific-brief",
  "/intelligence/pacific-travel",
  "/pacific/events",
  "/pacific/weather",
  "/algorand/wallet-balance",
  "/finance/pacific-gdp",
  "/demographics/pacific-population",
  "/finance/pacific-cpi",
  "/pacific/samoa-entity-setup",
  "/pacific/samoa-compliance-status",
  "/pacific/samoa-service-providers",
  "/pacific/samoa-banking-setup",
];

function datasetIdFromDirectPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) throw new Error(`cannot derive dataset id from path "${path}"`);
  return last;
}

const agentDatasetGatewayRoutes: PaidRouteSpec[] = AGENT_DATASET_GATEWAY_DIRECT_PATHS.map((path) => {
  const directRoute = paidRoutesBase.find((r) => r.method === "GET" && r.path === path);
  if (!directRoute) {
    throw new Error(`Agent Dataset Gateway: no direct GET paidRoutes entry found for "${path}" — AGENT_DATASET_GATEWAY_DIRECT_PATHS is out of sync with paidRoutesBase.`);
  }

  const datasetId = datasetIdFromDirectPath(path);
  return {
    method: "POST",
    path: `/api/v1/datasets/${datasetId}/query`,
    description: `Agent Dataset Gateway query adapter for dataset "${datasetId}" — see GET /api/v1/datasets for the full catalog and GET /api/v1/manifests/${datasetId} for its schema. Requires X-Agent-Wallet header naming a wallet already registered in the agents table. Priced identically to the direct route (GET ${path}): $${directRoute.priceUsdc} USDC.`,
    priceUsdc: directRoute.priceUsdc,
    payToAddress: directRoute.payToAddress,
  };
});

export const paidRoutes: PaidRouteSpec[] = [...paidRoutesBase, ...agentDatasetGatewayRoutes];
