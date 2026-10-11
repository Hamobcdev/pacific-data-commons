import { Hono, type Context } from "hono";
import { PdcPaymentGate, installBazaarAjvWorkersLogFilter } from "@pdc/x402-adapter";
import { logger } from "./lib/logger.js";
import { paidRoutes } from "./routeSchemas.js";
import type { Env } from "./lib/env.js";
import { createSupabaseClient } from "./lib/supabase.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { withDashboardBypass } from "./middleware/dashboardBypass.js";
import { logSettledDirectoryQuery } from "./services/directoryPaymentLogger.js";
import { healthRoute } from "./routes/health.js";
import { brandingRoute } from "./routes/branding.js";
import { categoriesRoute } from "./routes/categories.js";
import { countriesRoute } from "./routes/countries.js";
import { searchRoute } from "./routes/search.js";
import { providerRoute } from "./routes/provider.js";
import { endpointRoute } from "./routes/endpoint.js";
import { verifyRoute } from "./routes/verify.js";
import { discoveryRoute } from "./routes/discovery.js";
import { wellKnownX402Route } from "./routes/wellKnownX402.js";
import { psrRoute } from "./routes/psr.js";
import { attributionRoute } from "./routes/attribution.js";
import { complianceRoute } from "./routes/compliance.js";
import { internalRoute } from "./routes/internal.js";
import { updatesRoute } from "./routes/updates.js";
import { externalSourcesRoute } from "./routes/externalSources.js";
import { walletBalanceRoute } from "./routes/algorand/wallet-balance.js";
import { fxRoute } from "./routes/finance/fx.js";
import { samoaCpiRoute } from "./routes/finance/samoa-cpi.js";
import { samoaGdpRoute } from "./routes/finance/samoa-gdp.js";
import { fijiGdpRoute } from "./routes/finance/fiji-gdp.js";
import { fijiCpiRoute } from "./routes/finance/fiji-cpi.js";
import { pacificOceanTemperatureRoute } from "./routes/climate/ocean-temperature.js";
import { pacificWaterTemperatureRoute } from "./routes/climate/pacific-ocean-temp.js";
import { pacificPurseSeineRoute } from "./routes/fisheries/pacific-purse-seine.js";
import { pacificOceanForecastRoute } from "./routes/climate/pacific-ocean-forecast.js";
import { pacificCoralBleachingRoute } from "./routes/climate/pacific-coral-bleaching.js";
import { pacificCycloneHistoryRoute } from "./routes/climate/pacificCycloneHistory.js";
import { pacificSeaLevelRoute } from "./routes/climate/pacificSeaLevel.js";
import { pacificEnsoIndexRoute } from "./routes/climate/pacificEnsoIndex.js";
import { pacificCryptoRatesRoute } from "./routes/finance/crypto-rates.js";
import { pacificCryptoHistoryRoute } from "./routes/finance/crypto-history.js";
import { pacificDexArbitrageRoute } from "./routes/finance/arbitrage-signals.js";
import { pacificRemittanceRoute } from "./routes/finance/remittance-corridors.js";
import { pacificBriefRoute } from "./routes/intelligence/pacific-brief.js";
import { pacificEventsRoute } from "./routes/pacific/events.js";
import { pacificWeatherRoute } from "./routes/pacific/weather.js";
import { pacificTravelRoute } from "./routes/intelligence/pacific-travel.js";
import { agentDatasetGatewayRoute } from "./routes/agentDatasetGateway.js";
import type { AppBindings } from "./types.js";
import type { KVNamespace } from "@cloudflare/workers-types";

// Directory query fee — Decision 8 / Revenue Model (CLAUDE.md Section 7).
// Errata (Section 12): $0.01, not the $0.001 in the original Part 3 draft.
const DIRECTORY_QUERY_PRICE_USDC = 0.01;

// Remaining per-route prices (WALLET_BALANCE_PRICE_USDC, FX_PRICE_USDC,
// PACIFIC_BRIEF_PRICE_USDC, EVENTS_PRICE_USDC, WEATHER_PRICE_USDC,
// PACIFIC_TRAVEL_PRICE_USDC) moved into ./routeSchemas.ts alongside the
// paidRoutes array they price — see that file's doc comment for why.

// /api/data/* -> canonical route aliases (fix/api-data-route-aliases). A
// 301 redirect, not a second route registration: the payment gate only
// ever knows about the canonical paths registered via addRoute() above,
// so an alias that served the response directly here would bypass x402
// entirely for that path. Redirecting instead sends the client's
// follow-up request to the real path, where payment is enforced as
// normal. Deliberately an explicit lookup table, not a generic
// /api/data/:rest -> /:rest rewrite — only these 12 paths are known
// aliases; anything else under /api/data/ falls through to the 404
// handler rather than guessing a target.
export const API_DATA_ROUTE_ALIASES: Record<string, string> = {
  "samoa-cpi": "/finance/samoa-cpi",
  "samoa-gdp": "/finance/samoa-gdp",
  "ocean-temperature": "/climate/ocean-temperature",
  "pacific-ocean-temp": "/climate/pacific-ocean-temp",
  "ocean-forecast": "/climate/pacific-ocean-forecast",
  "coral-bleaching": "/climate/pacific-coral-bleaching",
  "purse-seine": "/fisheries/pacific-purse-seine",
  "fiji-gdp": "/finance/fiji-gdp",
  search: "/search",
  fx: "/finance/fx",
  "crypto-prices": "/finance/crypto-rates",
  "fx-rates": "/finance/fx",
  "crypto-rates": "/finance/crypto-rates",
  "arbitrage-signals": "/finance/arbitrage-signals",
  "remittance-corridors": "/finance/remittance-corridors",
};

/**
 * Pure handler, exported separately for direct unit testing — same
 * "pull the branching into a plain function" pattern as
 * middleware/dashboardBypass.ts's isDashboardBypassRequest. Preserves the
 * original query string verbatim (via URL.search, not a re-serialised
 * URLSearchParams) so duplicate keys and param order survive the redirect
 * unchanged.
 */
export function apiDataAliasHandler(c: Context<AppBindings>): Response | Promise<Response> {
  const pathParam = c.req.param("path");
  const target = pathParam ? API_DATA_ROUTE_ALIASES[pathParam] : undefined;
  if (!target) return notFoundHandler(c);
  const { search } = new URL(c.req.url);
  return c.redirect(`${target}${search}`, 301);
}

/**
 * Builds and returns the configured Hono app. Pure with respect to runtime
 * (no process.env access, no listen/serve call) so the identical app can be
 * driven by Node's @hono/node-server (index.ts, local dev) or Cloudflare
 * Workers' fetch handler (worker.ts, Session 40 Cloudflare migration) —
 * env is passed in by whichever entry point loaded it.
 *
 * cryptoPricesKv is optional and Workers-only: worker.ts passes the real
 * CRYPTO_PRICES_KV binding through; index.ts (Node local dev) has no
 * Workers bindings and omits it, leaving /finance/crypto-rates and
 * /finance/crypto-history to their existing non-KV fallback behaviour.
 */
export function createApp(env: Env, cryptoPricesKv?: KVNamespace) {
  // Must be installed before the x402 payment gate's middleware is
  // constructed below (it kicks off @x402/hono's dynamic bazaar-validation
  // import as soon as middleware() runs) — see
  // packages/pdc-x402-adapter/src/bazaarAjvWorkersLogFilter.ts for the full
  // root-cause writeup of the known, non-fatal Cloudflare Workers + Ajv
  // incompatibility this narrowly reclassifies. Same fix as
  // apps/pilot-endpoint, applied here since this app also registers
  // extensions.bazaar on some routes (see discoveryFor below).
  installBazaarAjvWorkersLogFilter({
    onKnownIssue: ({ route, rawWarnMessage }) =>
      logger.info("x402_bazaar_ajv_workers_codegen_restriction", {
        route,
        detail: rawWarnMessage,
        explanation:
          "Cloudflare Workers disallows the runtime new Function() call @x402/extensions' bazaar " +
          "discovery-schema self-check needs (via Ajv). Non-fatal — this route's own payment " +
          "response is unaffected; this is @x402/hono's internal spec-conformance check, not a " +
          "defect in this route's schema. Filed upstream: https://github.com/x402-foundation/x402/issues/3556",
      }),
  });

  const supabase = createSupabaseClient(env);

  const paymentGate = new PdcPaymentGate({
    payToAddress: env.AVM_ADDRESS,
    facilitatorUrl: env.FACILITATOR_URL,
    network: env.ALGORAND_NETWORK,
  });

  // discoveryFor + paidRoutes (imported above) moved into ./routeSchemas.ts —
  // see that file's doc comment and apps/pilot-endpoint/src/routeSchemas.ts
  // for why (routeSchemas.test.ts calls ajv.compile() on every route's
  // discovery.schema directly in Node at test time).
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
      ...(route.payToAddress ? { payToAddress: route.payToAddress } : {}),
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
    c.set("cryptoPricesKv", cryptoPricesKv);
    await next();
  });

  app.use("*", rateLimit({ windowMs: 60_000, max: 300 }));

  // Payment gate is mounted globally but only intercepts the paths
  // registered via addRoute() above — everything else passes through.
  // Wrapped (not called directly) so the SBP website's dashboard key can
  // skip payment on exactly the 5 financial endpoints it needs — see
  // middleware/dashboardBypass.ts for why this wrapping, not an earlier
  // skip-next() middleware, is the only way to do that in Hono's model.
  app.use("*", withDashboardBypass(paymentGate.middleware(), env.DASHBOARD_INTERNAL_KEY));

  app.route("/", healthRoute);
  app.route("/", brandingRoute);
  app.route("/", discoveryRoute);
  app.route("/", wellKnownX402Route);
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
  app.route("/", samoaCpiRoute);
  app.route("/", samoaGdpRoute);
  app.route("/", fijiGdpRoute);
  app.route("/", fijiCpiRoute);
  app.route("/", pacificOceanTemperatureRoute);
  app.route("/", pacificWaterTemperatureRoute);
  app.route("/", pacificPurseSeineRoute);
  app.route("/", pacificOceanForecastRoute);
  app.route("/", pacificCoralBleachingRoute);
  app.route("/", pacificCycloneHistoryRoute);
  app.route("/", pacificSeaLevelRoute);
  app.route("/", pacificEnsoIndexRoute);
  app.route("/", pacificCryptoHistoryRoute);
  app.route("/", pacificCryptoRatesRoute);
  app.route("/", pacificDexArbitrageRoute);
  app.route("/", pacificRemittanceRoute);
  app.route("/", pacificBriefRoute);
  app.route("/", pacificEventsRoute);
  app.route("/", pacificWeatherRoute);
  app.route("/", pacificTravelRoute);
  app.route("/", agentDatasetGatewayRoute);

  // /api/data/* -> canonical route aliases — see API_DATA_ROUTE_ALIASES'
  // doc comment above for why this is a redirect, not a route alias
  // registered against the payment gate. :path{.+} (not a plain *)
  // captures the remainder as a named param, including any slashes, so a
  // nested alias target wouldn't need special-casing if one is ever added.
  app.get("/api/data/:path{.+}", apiDataAliasHandler);

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}
