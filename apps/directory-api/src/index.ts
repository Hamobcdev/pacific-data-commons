import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { declareDiscoveryExtension } from "@x402-avm/extensions";
import { PdcPaymentGate } from "@pdc/x402-adapter";
import { loadEnv } from "./lib/env.js";
import { createSupabaseClient } from "./lib/supabase.js";
import { logger } from "./lib/logger.js";
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
import { attributionRoute } from "./routes/attribution.js";
import { internalRoute } from "./routes/internal.js";
import { updatesRoute } from "./routes/updates.js";
import { externalSourcesRoute } from "./routes/externalSources.js";
import { walletBalanceRoute } from "./routes/algorand/wallet-balance.js";
import { fxRoute } from "./routes/finance/fx.js";
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

function main(): void {
  const env = loadEnv();
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
  app.route("/", categoriesRoute);
  app.route("/", countriesRoute);
  app.route("/", searchRoute);
  app.route("/", providerRoute);
  app.route("/", endpointRoute);
  app.route("/", verifyRoute);
  app.route("/", attributionRoute);
  app.route("/", internalRoute);
  app.route("/", updatesRoute);
  app.route("/", externalSourcesRoute);
  app.route("/", walletBalanceRoute);
  app.route("/", fxRoute);

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info("directory_api_started", {
      port: info.port,
      network: env.ALGORAND_NETWORK,
      env: env.NODE_ENV,
    });
  });
}

main();
