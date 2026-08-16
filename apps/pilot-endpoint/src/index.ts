import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { declareDiscoveryExtension } from "@x402-avm/extensions";
import { PdcPaymentGate, checkFacilitatorHealth } from "@pdc/x402-adapter";
import { loadEnv } from "./types/env.js";
import { logger } from "./lib/logger.js";
import { computeCanonicalHash } from "./lib/hash.js";
import { formatUsdc, TIER_PRICING } from "./lib/pricing.js";
import { DATASET_METADATA, FISHERIES_RECORDS } from "./data/fisheries.js";
import { createSupabaseClient } from "./lib/supabase.js";
import { resolveDirectoryContext } from "./services/directoryContext.js";
import { logSettledEndpointPayment } from "./services/transactionLogger.js";
import { corsMiddleware } from "./middleware/cors.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { errorHandlerMiddleware } from "./middleware/error-handler.js";
import { healthRoute } from "./routes/free/health.js";
import { provenanceRoute } from "./routes/free/provenance.js";
import { integrityRoute } from "./routes/free/integrity.js";
import { schemaRoute } from "./routes/free/schema.js";
import { skillsAgentmarketRoute } from "./routes/free/skills-am.js";
import { skillsPdpRoute } from "./routes/free/skills-pdp.js";
import { summaryRoute } from "./routes/paid/summary.js";
import { sliceRoute } from "./routes/paid/slice.js";
import { fullRoute } from "./routes/paid/full.js";
import { expertRoute } from "./routes/paid/expert.js";
import { commissionRoute } from "./routes/paid/commission.js";
import type { AppBindings } from "./types.js";

async function main(): Promise<void> {
  const env = loadEnv();

  // ── R7: canonical hash computed once at startup, cached for every request ──
  const datasetHash = computeCanonicalHash(FISHERIES_RECORDS);
  const hashComputedAt = new Date().toISOString();

  logger.info("pilot_endpoint_starting", {
    dataset: DATASET_METADATA.title,
    records: FISHERIES_RECORDS.length,
    canonical_hash: datasetHash,
    network: `algorand-${env.ALGORAND_NETWORK}`,
    competition_tag: DATASET_METADATA.competition_tag,
  });

  // R4: a facilitator outage at boot must not crash the process — free
  // routes still serve, paid routes will 502 gracefully per request until
  // it recovers (see PdcPaymentGate / errorHandlerMiddleware).
  const facilitatorHealthy = await checkFacilitatorHealth(env.FACILITATOR_URL);
  if (!facilitatorHealthy) {
    logger.warn("facilitator_unreachable_at_startup", {
      facilitator_url: env.FACILITATOR_URL,
      action: "continuing — free routes will still serve",
    });
  }

  // Session 19 — resolved once at startup, same pattern as datasetHash
  // above: which provider/endpoint row in the directory this deployment
  // actually *is*, so every settled payment can be attributed without a
  // per-request directory lookup. A miss degrades to "log and skip", not a
  // boot failure (see resolveDirectoryContext's doc comment).
  const supabase = createSupabaseClient(env);
  const directoryContext = await resolveDirectoryContext(supabase, env.PUBLIC_URL, DATASET_METADATA.category);
  if (!directoryContext) {
    logger.warn("pilot_endpoint_starting_without_transaction_logging", {
      public_url: env.PUBLIC_URL,
      category: DATASET_METADATA.category,
    });
  }

  // ── x402 payment gate (via @pdc/x402-adapter — never import @x402/* directly, R1) ──
  const paymentGate = new PdcPaymentGate({
    payToAddress: env.AVM_ADDRESS,
    facilitatorUrl: env.FACILITATOR_URL,
    network: env.ALGORAND_NETWORK,
  });

  // Session 19 — every settled payment on the 5 paid routes below now logs
  // to transactions_log (previously never written anywhere from this
  // process — see types/env.ts's doc comment).
  paymentGate.onSettled(async (payment) => {
    await logSettledEndpointPayment(supabase, payment, directoryContext);
  });

  // Bazaar discovery metadata (Session 8.1) — built with @x402-avm/extensions'
  // declareDiscoveryExtension, a pure data-shape builder with no coupling to
  // any particular x402 core implementation. Deliberately NOT using that
  // package's bazaarResourceServerExtension: it's typed against
  // @x402-avm/core's x402ResourceServer, a different class from the
  // @x402/core one PdcPaymentGate actually wraps (R1 — @pdc/x402-adapter is
  // the only module that touches @x402/* directly). @x402/core has its own
  // native support for the same "extensions.bazaar" wire field
  // (checkIfBazaarNeeded / enrichExtensions in @x402/core/server), so the
  // discovery object just needs to be attached at RouteConfig.extensions.bazaar
  // via PdcPaidRouteSpec.extensions — see packages/pdc-x402-adapter.
  //
  // declareDiscoveryExtension() already returns { bazaar: DiscoveryExtension }
  // (see @x402-avm/extensions/dist/*/bazaar/resourceService.js) — discoveryFor()
  // below unwraps that so call sites can do `extensions: { bazaar: ... }`
  // themselves, matching the RouteConfig field name explicitly.
  //
  // Its published input type omits `method`, because it's normally filled in
  // later by bazaarResourceServerExtension.enrichDeclaration from the live
  // request's transport context — a hook we don't register (see above). We
  // supply `method` up front instead; the bundled implementation reads and
  // emits it unconditionally when present, so this is a type-level gap only,
  // not a runtime one. Building each config as a variable of this widened
  // type (rather than passing an inline object literal) is what lets TS
  // accept the extra field without fighting the public type's excess-property
  // check.
  type DiscoveryConfig = Parameters<typeof declareDiscoveryExtension>[0] & { method: "GET" | "POST" | "HEAD" | "DELETE" | "PUT" | "PATCH" };
  function discoveryFor(config: DiscoveryConfig) {
    return declareDiscoveryExtension(config).bazaar;
  }

  const paidRoutes: Array<{
    method: "GET" | "POST";
    path: string;
    tier: keyof typeof TIER_PRICING;
    description: string;
    discovery: ReturnType<typeof discoveryFor>;
  }> = [
    {
      method: "GET",
      path: "/summary",
      tier: "summary",
      description: `Key findings summary for ${DATASET_METADATA.title}. Returns stock status by species, coverage statistics, and 3 key findings. SYNTHETIC DEMO DATA.`,
      discovery: discoveryFor({
        method: "GET",
        output: {
          example: {
            schema_version: "pdp-1.0",
            paid_tier: "summary",
            data: {
              total_records: FISHERIES_RECORDS.length,
              species_covered: ["skipjack", "yellowfin", "bigeye"],
              zones_covered: ["samoa_eez", "tonga_eez"],
              stock_status: [{ species: "skipjack", latest_year: 2023, stock_index: 0.92, status: "healthy" }],
              key_findings: ["Skipjack remains the dominant species with stock index 0.92 in 2023"],
            },
          },
        },
      }),
    },
    {
      method: "GET",
      path: "/slice",
      tier: "slice",
      description:
        "Filtered tuna data slice. Query params: species (skipjack|yellowfin|bigeye), year_start, year_end, zone (samoa_eez|tonga_eez). SYNTHETIC DEMO DATA.",
      discovery: discoveryFor({
        method: "GET",
        input: { species: "skipjack", year_start: 2020, year_end: 2023, zone: "samoa_eez" },
        inputSchema: {
          properties: {
            species: { type: "string", enum: ["skipjack", "yellowfin", "bigeye"] },
            year_start: { type: "integer", description: `>= ${DATASET_METADATA.time_period_start}` },
            year_end: { type: "integer", description: `<= ${DATASET_METADATA.time_period_end}` },
            zone: { type: "string", enum: ["samoa_eez", "tonga_eez"] },
          },
          required: [],
        },
        output: {
          example: {
            schema_version: "pdp-1.0",
            paid_tier: "slice",
            data: [{ species: "skipjack", zone: "samoa_eez", year: 2023, stock_index: 0.92 }],
          },
        },
      }),
    },
    {
      method: "GET",
      path: "/full",
      tier: "full",
      description: "Complete synthetic tuna dataset — all 18 records, all species, all years, both zones. SYNTHETIC DEMO DATA.",
      discovery: discoveryFor({
        method: "GET",
        output: {
          example: { schema_version: "pdp-1.0", paid_tier: "full", data: [{ species: "skipjack", zone: "samoa_eez", year: 2023, stock_index: 0.92 }] },
        },
      }),
    },
    {
      method: "GET",
      path: "/expert",
      tier: "expert",
      description: "Full dataset plus methodology notes, stock assessment interpretation, and citation-ready format. SYNTHETIC DEMO DATA.",
      discovery: discoveryFor({
        method: "GET",
        output: {
          example: {
            schema_version: "pdp-1.0",
            paid_tier: "expert",
            data: [{ species: "skipjack", zone: "samoa_eez", year: 2023, stock_index: 0.92 }],
            expert_annotations: { stock_assessment_method: "Virtual Population Analysis (VPA) — synthetic demonstration" },
          },
        },
      }),
    },
    {
      method: "POST",
      path: "/commission",
      tier: "commission",
      description: "Custom commissioned query. POC: payment confirms your commission request. SBP will contact you within 48 hours to discuss scope.",
      discovery: discoveryFor({
        method: "POST",
        bodyType: "json",
        input: { analysis_request: "Describe the custom Pacific fisheries analysis you need" },
        inputSchema: {
          properties: {
            analysis_request: {
              type: "string",
              description:
                "Free-text description of the analysis you're commissioning. POC: not parsed by the handler — recorded via your payment, SBP follows up by email.",
            },
          },
          required: [],
        },
        output: {
          example: {
            commission_confirmed: true,
            message: "Your commission payment has been received. SBP will contact you within 48 hours.",
            contact: "contact@synergybp.com",
          },
        },
      }),
    },
  ];

  for (const route of paidRoutes) {
    paymentGate.addRoute({
      method: route.method,
      path: route.path,
      priceUsdc: TIER_PRICING[route.tier],
      description: route.description,
      resource: `pdc-pilot-endpoint:${route.path}`,
      extra: {
        service: "pacific-data-commons-pilot",
        category: DATASET_METADATA.category,
        tier: route.tier,
      },
      extensions: { bazaar: route.discovery },
    });
  }

  const app = new Hono<AppBindings>();

  app.use("*", async (c, next) => {
    c.set("env", env);
    c.set("datasetHash", datasetHash);
    c.set("hashComputedAt", hashComputedAt);
    await next();
  });

  app.use("*", requestIdMiddleware);
  app.use("*", corsMiddleware);
  app.use("*", rateLimit({ windowMs: 60_000, max: 300 }));

  // Mounted globally but only intercepts the 5 paths registered above —
  // everything else (all 6 free routes) passes straight through.
  app.use("*", paymentGate.middleware());

  app.route("/", healthRoute);
  app.route("/", provenanceRoute);
  app.route("/", integrityRoute);
  app.route("/", schemaRoute);
  app.route("/", skillsAgentmarketRoute);
  app.route("/", skillsPdpRoute);

  app.route("/", summaryRoute);
  app.route("/", sliceRoute);
  app.route("/", fullRoute);
  app.route("/", expertRoute);
  app.route("/", commissionRoute);

  app.notFound((c) =>
    c.json(
      {
        error: "Route not found",
        code: "NOT_FOUND",
        available_free_routes: [
          "/health",
          "/provenance",
          "/integrity",
          "/schema",
          "/skills-agentmarket.json",
          "/skills-pdp.json",
        ],
        available_paid_routes: [
          `/summary (${formatUsdc(TIER_PRICING.summary)})`,
          `/slice (${formatUsdc(TIER_PRICING.slice)})`,
          `/full (${formatUsdc(TIER_PRICING.full)})`,
          `/expert (${formatUsdc(TIER_PRICING.expert)})`,
          `/commission (${formatUsdc(TIER_PRICING.commission)})`,
        ],
        timestamp: new Date().toISOString(),
      },
      404,
    ),
  );

  app.onError(errorHandlerMiddleware);

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info("pilot_endpoint_ready", { port: info.port, publicUrl: env.PUBLIC_URL });
  });
}

main();
