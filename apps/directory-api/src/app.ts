import { Hono, type Context } from "hono";
import { PdcUnifiedPaymentGate, installBazaarAjvWorkersLogFilter, type SettledUnifiedPayment } from "@pdc/x402-adapter";
import { logger } from "./lib/logger.js";
import { paidRoutes, categorizeRoute, PDC_MERCHANT_INFO } from "./routeSchemas.js";
import { declarePaymentIdentifierExtension } from "@x402-avm/extensions/payment-identifier";
import type { Env } from "./lib/env.js";
import { createSupabaseClient } from "./lib/supabase.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { withDashboardBypass } from "./middleware/dashboardBypass.js";
import { preGateRequiredParamValidation } from "./middleware/preGateRequiredParams.js";
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
import { agentDiscoveryRoute } from "./routes/agentDiscovery.js";
import { logoRoute } from "./routes/logo.js";
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
import { pacificGdpRoute } from "./routes/finance/pacific-gdp.js";
import { pacificPopulationRoute } from "./routes/demographics/pacific-population.js";
import { pacificCpiRoute } from "./routes/finance/pacific-cpi.js";
import { samoaEntitySetupRoute } from "./routes/pacific/samoa-entity-setup.js";
import { samoaComplianceStatusRoute } from "./routes/pacific/samoa-compliance-status.js";
import { samoaServiceProvidersRoute } from "./routes/pacific/samoa-service-providers.js";
import { samoaBankingSetupRoute } from "./routes/pacific/samoa-banking-setup.js";
import { vanuatuIbcSetupRoute } from "./routes/pacific/vanuatu-ibc-setup.js";
import { vanuatuIbcComplianceRoute } from "./routes/pacific/vanuatu-ibc-compliance.js";
import { vanuatuVfscLicensesRoute } from "./routes/pacific/vanuatu-vfsc-licenses.js";
import { vanuatuRegisteredAgentsRoute } from "./routes/pacific/vanuatu-registered-agents.js";
import { vanuatuCitizenshipInvestmentRoute } from "./routes/pacific/vanuatu-citizenship-investment.js";
import { agentDatasetGatewayRoute } from "./routes/agentDatasetGateway.js";
import { pacificSetupComparisonRoute } from "./routes/invest/pacific-setup-comparison.js";
import { pacificTaxComparisonRoute } from "./routes/invest/pacific-tax-comparison.js";
import { pacificLandTenureRoute } from "./routes/invest/pacific-land-tenure.js";
import { pacificSectorRestrictionsRoute } from "./routes/invest/pacific-sector-restrictions.js";
import { pacificRegulatoryScoresRoute } from "./routes/invest/pacific-regulatory-scores.js";
import { pacificSetupChecklistRoute } from "./routes/invest/pacific-setup-checklist.js";
import { paymentRoutes } from "./routes/payment.js";
import { internalDataFetchRoute } from "./routes/internal/data-fetch.js";
// Pacific Tourism Data Framework — Phase B.
import { tourismDestinationRoute } from "./routes/tourism/tourism-destination.js";
import { tourismAccommodationRoute } from "./routes/tourism/tourism-accommodation.js";
import { tourismActivitiesRoute } from "./routes/tourism/tourism-activities.js";
import { tourismSafetyRoute } from "./routes/tourism/tourism-safety.js";
import { tourismFoodMarketsRoute } from "./routes/tourism/tourism-food-markets.js";
import { tourismTransportRoute } from "./routes/tourism/tourism-transport.js";
import { tourismEventsRoute } from "./routes/tourism/tourism-events.js";
import { tourismSearchRoute } from "./routes/tourism/tourism-search.js";
import { tourismProvidersRoute } from "./routes/tourism/tourism-providers.js";
import { tourismWeddingsRoute } from "./routes/tourism/tourism-weddings.js";
import { corsMiddleware } from "./middleware/cors.js";
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

  // feat/unified-payment-gate: Algorand + Base + Solana behind one
  // x402ResourceServer, one accepts[] per route, one middleware mount — see
  // packages/pdc-x402-adapter/src/schemes/unified-gate.ts's header comment
  // for why this supersedes the earlier (abandoned, never committed)
  // three-separate-gates design. Base/Solana are enabled only when their
  // flags AND required config are all present — PDC_BASE_ENABLED and
  // PDC_SOLANA_ENABLED must stay "false" in every committed env file (see
  // .env.example) until that's explicitly turned on per environment.
  const unifiedGate = new PdcUnifiedPaymentGate({
    algorandNetwork: env.ALGORAND_NETWORK,
    algorandFacilitatorUrl: env.FACILITATOR_URL,
    algorandMerchantAddress: env.AVM_ADDRESS,
    enableBase: env.PDC_BASE_ENABLED === "true",
    baseMerchantAddress: env.PDC_BASE_MERCHANT_ADDRESS as `0x${string}` | undefined,
    payaiFacilitatorUrl: env.PAYAI_FACILITATOR_URL,
    enableSolana: env.PDC_SOLANA_ENABLED === "true",
    solanaMerchantAddress: env.PDC_SOLANA_MERCHANT_ADDRESS,
    solanaRpcUrl: env.SOLANA_RPC_URL,
    merchant: {
      serviceName: "Pacific Data Commons",
      description: "Sovereign data marketplace for Pacific Island nations and institutions. Payment-gated endpoints delivering climate, fisheries, trade, and economic data for AI agents and researchers. Data sovereignty enforced — providers control their own infrastructure.",
      url: "https://pdc.synergybcpacific.com",
      iconUrl: "https://pdc.synergybcpacific.com/images/sbp-logo.png",
      tags: ["data-marketplace", "pacific", "sovereign-infrastructure", "ai-agents", "sids", "climate-data", "fisheries"],
    },
  });

  // discoveryFor + paidRoutes (imported above) moved into ./routeSchemas.ts —
  // see that file's doc comment and apps/pilot-endpoint/src/routeSchemas.ts
  // for why (routeSchemas.test.ts calls ajv.compile() on every route's
  // discovery.schema directly in Node at test time).
  //
  // route.payToAddress is deliberately the only payTo field read here —
  // every occurrence in routeSchemas.ts resolves to AVM_ADDRESS (an
  // Algorand wallet) or an AVM_ADDRESS-derived *_PAYTO constant (confirmed
  // by reading every occurrence in that file, not assumed), so it only
  // ever reaches PdcUnifiedPaymentGate.addRoute()'s Algorand-specific
  // payToAddress field — never evmPayToAddress/svmPayToAddress, which
  // nothing in routeSchemas.ts sets. Base/Solana routes therefore all use
  // the gate's own baseMerchantAddress/solanaMerchantAddress uniformly.
  //
  // No separate HEAD-workaround loop here (x402-foundation/x402#3796) —
  // PdcUnifiedPaymentGate.addRoute() now does that internally for every
  // registered GET route, same fix, one fewer place to apply it.
  for (const route of paidRoutes) {
    // x402-merchant + payment-identifier (fix/x402-route-headers) — declared
    // on every paid route alongside the existing bazaar extension, so
    // GoPlausible's dashboard shows "Pacific Data Commons" with a logo
    // instead of a raw payTo address, and clients retrying a dropped
    // connection can supply an idempotency key. declarePaymentIdentifierExtension()
    // comes from @x402-avm/extensions (already a directory-api dependency,
    // GoPlausible's own fork — not the generic @x402/extensions package,
    // which isn't installed here).
    unifiedGate.addRoute({
      method: route.method,
      path: route.path,
      priceUsdc: route.priceUsdc ?? DIRECTORY_QUERY_PRICE_USDC,
      description: route.description,
      // Session 22 — was `pdc-directory-api:${route.path}`, same URN-style
      // non-URL bug as apps/pilot-endpoint's identical pattern; see that
      // file's matching comment for how this was confirmed live against
      // the facilitator.
      resource: `${env.PUBLIC_URL}${route.path}`,
      mimeType: "application/json",
      ...(route.payToAddress ? { payToAddress: route.payToAddress } : {}),
      extensions: {
        ...(route.discovery ? { bazaar: route.discovery } : {}),
        "x402-merchant": { info: { ...PDC_MERCHANT_INFO, categories: categorizeRoute(route.path) } },
        "payment-identifier": declarePaymentIdentifierExtension(),
      },
    });
  }

  unifiedGate.onSettled(async (payment: SettledUnifiedPayment) => {
    if (payment.chain === "algorand") {
      // Backward compat: logSettledDirectoryQuery + its Supabase table are
      // typed against SettledPdcPayment (algoTxId/network columns) — build
      // that exact shape from the chain-agnostic event rather than
      // changing that function or its schema.
      await logSettledDirectoryQuery(supabase, {
        method: payment.method,
        path: payment.path,
        algoTxId: payment.algoTxId ?? payment.txId,
        payerAddress: payment.payerAddress || undefined,
        amountUsdc: String(payment.amountUsdc),
        network: payment.network ?? env.ALGORAND_NETWORK,
        responseBody: payment.responseBody,
      });
      return;
    }
    // Base/Solana: structured-log only for now — a chain-agnostic
    // settlement table is a future build, deliberately not created in
    // this PR (see PR description).
    logger.info("directory_payment_settled", { ...payment });
  });

  const app = new Hono<AppBindings>();

  // Registered first — before any other middleware or route — so CORS
  // headers (notably Access-Control-Expose-Headers for PAYMENT-REQUIRED/
  // PAYMENT-RESPONSE) apply to every response this app returns, paid
  // routes included, and to error/404 responses too. Same implementation
  // as apps/pilot-endpoint/src/middleware/cors.ts (Session 24 fix) —
  // ported here for the x402 Doctor's CORS warning on this app's own
  // paid routes.
  app.use("*", corsMiddleware);

  app.use("*", async (c, next) => {
    c.set("env", env);
    c.set("supabase", supabase);
    c.set("paymentGate", unifiedGate);
    c.set("cryptoPricesKv", cryptoPricesKv);
    await next();
  });

  app.use("*", rateLimit({ windowMs: 60_000, max: 300 }));

  // Human payment rail (competition, simplified flow) — registered here,
  // after the Variables bootstrap + rate limiter above, but BEFORE the
  // payment gate below. Neither /payment/verify nor /internal/data/* is
  // ever passed to paymentGate.addRoute(), so the gate would pass them
  // through untouched regardless of mount order anyway (see the comment
  // just below: unregistered paths already skip the gate's enforcement).
  // Mounting them before the gate's own middleware is the stronger,
  // defense-in-depth version of that same guarantee: in Hono's model, a
  // request's matching handlers run in registration order, and neither of
  // these two handlers ever calls next() — they fully resolve their own
  // response. So the gate middleware (registered after) is never even
  // invoked for these two paths, rather than relying on it to correctly
  // no-op for an unregistered path at request time.
  app.route("/", paymentRoutes);
  app.route("/", internalDataFetchRoute);

  // Pre-gate required-query-param check (fix/pregate-param-validation) —
  // must run BEFORE the payment gate below. The gate is mounted globally
  // and fires before any app.route() handler is dispatched, so a route
  // with a required param that's only validated inside its own handler
  // never gets a chance to 400 — the gate answers a 402 with no
  // Payment-Required header first, which an x402 agent can't act on. See
  // middleware/preGateRequiredParams.ts's doc comment for the full
  // root-cause writeup (Frits Zwager / Fizzl x402 Doctor bug report,
  // 10 Nov 2026) and the 7 routes this covers.
  app.use("*", preGateRequiredParamValidation());

  // Payment gate is mounted globally but only intercepts the paths
  // registered via addRoute() above — everything else passes through.
  // One mount, one middleware — unifiedGate's accepts[] already lists
  // every enabled chain per route, so there is nothing left to mount
  // "alongside" (see unified-gate.ts's header for what this replaces).
  // Wrapped (not called directly) so the SBP website's dashboard key can
  // skip payment on exactly the 5 financial endpoints it needs — see
  // middleware/dashboardBypass.ts for why this wrapping, not an earlier
  // skip-next() middleware, is the only way to do that in Hono's model.
  app.use("*", withDashboardBypass(unifiedGate.middleware(), env.DASHBOARD_INTERNAL_KEY));

  app.route("/", healthRoute);
  app.route("/", brandingRoute);
  app.route("/", discoveryRoute);
  app.route("/", wellKnownX402Route);
  app.route("/", agentDiscoveryRoute);
  app.route("/", logoRoute);
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
  app.route("/", pacificGdpRoute);
  app.route("/", pacificPopulationRoute);
  app.route("/", pacificCpiRoute);
  app.route("/", samoaEntitySetupRoute);
  app.route("/", samoaComplianceStatusRoute);
  app.route("/", samoaServiceProvidersRoute);
  app.route("/", samoaBankingSetupRoute);
  app.route("/", vanuatuIbcSetupRoute);
  app.route("/", vanuatuIbcComplianceRoute);
  app.route("/", vanuatuVfscLicensesRoute);
  app.route("/", vanuatuRegisteredAgentsRoute);
  app.route("/", vanuatuCitizenshipInvestmentRoute);
  app.route("/", pacificSetupComparisonRoute);
  app.route("/", pacificTaxComparisonRoute);
  app.route("/", pacificLandTenureRoute);
  app.route("/", pacificSectorRestrictionsRoute);
  app.route("/", pacificRegulatoryScoresRoute);
  app.route("/", pacificSetupChecklistRoute);
  app.route("/", agentDatasetGatewayRoute);
  // Pacific Tourism Data Framework — Phase B. Not registered on
  // GoPlausible (no `discovery` field on these routeSchemas.ts entries) —
  // payment-gate enforcement only, per that build's explicit brief.
  app.route("/", tourismDestinationRoute);
  app.route("/", tourismAccommodationRoute);
  app.route("/", tourismActivitiesRoute);
  app.route("/", tourismSafetyRoute);
  app.route("/", tourismFoodMarketsRoute);
  app.route("/", tourismTransportRoute);
  app.route("/", tourismEventsRoute);
  app.route("/", tourismSearchRoute);
  app.route("/", tourismProvidersRoute);
  app.route("/", tourismWeddingsRoute);

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
