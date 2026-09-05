import { Hono } from "hono";
import { declareDiscoveryExtension } from "@x402-avm/extensions";
import { PdcPaymentGate } from "@pdc/x402-adapter";
import type { Env } from "./lib/env.js";
import { createSupabaseClient } from "./lib/supabase.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { logSettledDirectoryQuery } from "./services/directoryPaymentLogger.js";
import { healthRoute } from "./routes/health.js";
import { categoriesRoute } from "./routes/categories.js";
import { countriesRoute } from "./routes/countries.js";
import { searchRoute } from "./routes/search.js";
import { providerRoute } from "./routes/provider.js";
import { endpointRoute } from "./routes/endpoint.js";
import { verifyRoute } from "./routes/verify.js";
import { discoveryRoute } from "./routes/discovery.js";
import { psrRoute } from "./routes/psr.js";
import { attributionRoute } from "./routes/attribution.js";
import { complianceRoute } from "./routes/compliance.js";
import { internalRoute } from "./routes/internal.js";
import { updatesRoute } from "./routes/updates.js";
import { externalSourcesRoute } from "./routes/externalSources.js";
import { walletBalanceRoute } from "./routes/algorand/wallet-balance.js";
import { fxRoute } from "./routes/finance/fx.js";
import { pacificBriefRoute } from "./routes/intelligence/pacific-brief.js";
import { pacificEventsRoute } from "./routes/pacific/events.js";
import { pacificWeatherRoute } from "./routes/pacific/weather.js";
import { pacificTravelRoute } from "./routes/intelligence/pacific-travel.js";
import type { AppBindings } from "./types.js";

// Directory query fee — Decision 8 / Revenue Model (CLAUDE.md Section 7).
// Errata (Section 12): $0.01, not the $0.001 in the original Part 3 draft.
const DIRECTORY_QUERY_PRICE_USDC = 0.01;

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

/**
 * Builds and returns the configured Hono app. Pure with respect to runtime
 * (no process.env access, no listen/serve call) so the identical app can be
 * driven by Node's @hono/node-server (index.ts, local dev) or Cloudflare
 * Workers' fetch handler (worker.ts, Session 40 Cloudflare migration) —
 * env is passed in by whichever entry point loaded it.
 */
export function createApp(env: Env) {
  const supabase = createSupabaseClient(env);

  const paymentGate = new PdcPaymentGate({
    payToAddress: env.AVM_ADDRESS,
    facilitatorUrl: env.FACILITATOR_URL,
    network: env.ALGORAND_NETWORK,
  });

  // Session 24 — same discoveryFor pattern as apps/pilot-endpoint/src/index.ts
  // (see that file's longer comment for why declareDiscoveryExtension is
  // used directly rather than @x402-avm/extensions' bazaarResourceServerExtension,
  // and why `method` is supplied up front). /search, /endpoint/:id, and
  // (Session 29) /algorand/wallet-balance get a discovery declaration here;
  // /provider/:id and /verify/:certHash remain undeclared, same as before
  // Session 24 — scoped to what each session's brief actually asked for.
  type DiscoveryConfig = Parameters<typeof declareDiscoveryExtension>[0] & { method: "GET" | "POST" | "HEAD" | "DELETE" | "PUT" | "PATCH" };
  function discoveryFor(config: DiscoveryConfig) {
    return declareDiscoveryExtension(config).bazaar;
  }

  const paidRoutes: Array<{ method: "GET"; path: string; description: string; discovery?: ReturnType<typeof discoveryFor>; priceUsdc?: number }> = [
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
        "Pacific FX rates: WST, FJD, TOP, PGK, SBD, VUV plus AUD, NZD, EUR, GBP, JPY, CNY, ALGO, and USDC, base USD. Optional conversion via ?from=&to=&amount=. Updated daily, 60-minute cache.",
      priceUsdc: FX_PRICE_USDC,
      discovery: discoveryFor({
        method: "GET",
        input: { from: "WST", to: "USD", amount: 100 },
        inputSchema: {
          properties: {
            from: { type: "string", description: "Source currency code — optional, required together with to and amount for conversion" },
            to: { type: "string", description: "Target currency code — optional, required together with from and amount for conversion" },
            amount: { type: "number", description: "Amount to convert — optional, required together with from and to for conversion" },
          },
          required: [],
        },
        output: {
          example: {
            base: "USD",
            timestamp: "2026-08-25T00:00:00.000Z",
            source: "currency-api",
            rates: { WST: 2.72, FJD: 2.19, TOP: 2.41, PGK: 4.44, SBD: 8.01, VUV: 118.36, AUD: 1.4, NZD: 1.67, EUR: 0.86, GBP: 0.73, JPY: 159.1, CNY: 6.72, ALGO: 0.092, USDC: 1.0 },
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
  ];

  for (const route of paidRoutes) {
    paymentGate.addRoute({
      method: route.method,
      path: route.path,
      priceUsdc: route.priceUsdc ?? DIRECTORY_QUERY_PRICE_USDC,
      description: route.description,
      // Session 22 — was `pdc-directory-api:${route.path}`, same URN-style
      // non-URL bug as apps/pilot-endpoint's identical pattern; see that
      // file's matching comment for how this was confirmed live against
      // the facilitator.
      resource: `${env.PUBLIC_URL}${route.path}`,
      ...(route.discovery ? { extensions: { bazaar: route.discovery } } : {}),
    });
  }

  paymentGate.onSettled(async (payment) => {
    await logSettledDirectoryQuery(supabase, payment);
  });

  const app = new Hono<AppBindings>();

  app.use("*", async (c, next) => {
    c.set("env", env);
    c.set("supabase", supabase);
    c.set("paymentGate", paymentGate);
    await next();
  });

  app.use("*", rateLimit({ windowMs: 60_000, max: 300 }));

  // Payment gate is mounted globally but only intercepts the paths
  // registered via addRoute() above — everything else passes through.
  app.use("*", paymentGate.middleware());

  app.route("/", healthRoute);
  app.route("/", discoveryRoute);
  app.route("/", psrRoute);
  app.route("/", categoriesRoute);
  app.route("/", countriesRoute);
  app.route("/", searchRoute);
  app.route("/", providerRoute);
  app.route("/", endpointRoute);
  app.route("/", verifyRoute);
  app.route("/", attributionRoute);
  app.route("/", complianceRoute);
  app.route("/", internalRoute);
  app.route("/", updatesRoute);
  app.route("/", externalSourcesRoute);
  app.route("/", walletBalanceRoute);
  app.route("/", fxRoute);
  app.route("/", pacificBriefRoute);
  app.route("/", pacificEventsRoute);
  app.route("/", pacificWeatherRoute);
  app.route("/", pacificTravelRoute);

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}
