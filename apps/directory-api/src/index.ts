import { serve } from "@hono/node-server";
import { Hono } from "hono";
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

  const paidRoutes: Array<{ method: "GET"; path: string; description: string }> = [
    { method: "GET", path: "/search", description: "Search Pacific data endpoints by category, country, price, keywords" },
    { method: "GET", path: "/provider/:id", description: "Full provider profile and its listed endpoints" },
    { method: "GET", path: "/endpoint/:id", description: "Full endpoint detail and sample response" },
    { method: "GET", path: "/verify/:certHash", description: "Verify a Pacific Data Protocol provenance certificate" },
  ];

  for (const route of paidRoutes) {
    paymentGate.addRoute({
      method: route.method,
      path: route.path,
      priceUsdc: DIRECTORY_QUERY_PRICE_USDC,
      description: route.description,
      resource: `pdc-directory-api:${route.path}`,
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
