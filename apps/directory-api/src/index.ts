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
import type { AppBindings } from "./types.js";

// Directory query fee — Decision 8 / Revenue Model (CLAUDE.md Section 7).
// Errata (Section 12): $0.01, not the $0.001 in the original Part 3 draft.
const DIRECTORY_QUERY_PRICE_USDC = 0.01;

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
  // and why `method` is supplied up front). Only /search and /endpoint/:id
  // get a discovery declaration here, not all 4 paid routes below —
  // /provider/:id and /verify/:certHash remain undeclared, same as before
  // this session; scoped to what Session 24's brief asked for.
  type DiscoveryConfig = Parameters<typeof declareDiscoveryExtension>[0] & { method: "GET" | "POST" | "HEAD" | "DELETE" | "PUT" | "PATCH" };
  function discoveryFor(config: DiscoveryConfig) {
    return declareDiscoveryExtension(config).bazaar;
  }

  const paidRoutes: Array<{ method: "GET"; path: string; description: string; discovery?: ReturnType<typeof discoveryFor> }> = [
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
  ];

  for (const route of paidRoutes) {
    paymentGate.addRoute({
      method: route.method,
      path: route.path,
      priceUsdc: DIRECTORY_QUERY_PRICE_USDC,
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
