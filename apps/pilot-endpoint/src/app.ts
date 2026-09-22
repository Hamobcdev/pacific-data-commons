import { Hono } from "hono";
import { PdcPaymentGate, checkFacilitatorHealth, installBazaarAjvWorkersLogFilter } from "@pdc/x402-adapter";
import { paidRoutes } from "./routeSchemas.js";
import type { Env } from "./types/env.js";
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
import { researchRoute } from "./routes/paid/research.js";
import { pacificAdoptionRoute } from "./routes/paid/pacificAdoption.js";
import { LAW_BEFORE_CODE, CRYPTOGRAPHIC_CONTINUITY, INVISIBLE_INFRASTRUCTURE } from "./data/research.js";
import { PACIFIC_ADOPTION_METADATA } from "./data/pacificAdoption.js";
import type { AppBindings } from "./types.js";

/**
 * Builds and returns the configured Hono app. Pure with respect to runtime
 * (no process.env access, no listen/serve call) so the identical app can be
 * driven by Node's @hono/node-server (index.ts, local dev) or Cloudflare
 * Workers' fetch handler (worker.ts, Session 40 Cloudflare migration) —
 * env is passed in by whichever entry point loaded it.
 */
export async function createApp(env: Env): Promise<Hono<AppBindings>> {
  // Must be installed before the x402 payment gate's middleware is
  // constructed below (it kicks off @x402/hono's dynamic bazaar-validation
  // import as soon as middleware() runs) — see bazaarAjvWorkersLogFilter.ts
  // for the full root-cause writeup of the known, non-fatal Cloudflare
  // Workers + Ajv incompatibility this narrowly reclassifies.
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

  const supabase = createSupabaseClient(env);

  // Session 21 — this process now serves 5 datasets (fisheries/ocean,
  // 2 research papers, 1 adoption landscape), not 1. A single directory
  // context resolved once at boot (Session 19's original approach) would
  // attribute every settled payment — regardless of which dataset's route
  // was actually paid for — to whichever one endpoint_id got resolved
  // first, silently merging revenue/query-count across unrelated listings.
  // Each entry below maps a settled payment's path to the
  // (category, subCategory) resolveDirectoryContext needs to look up that
  // route's *own* endpoint row, at settlement time — see
  // resolveDirectoryContext's and onSettled's doc comments.
  const ROUTE_DATASET: Record<string, { category: string; subCategory?: string }> = {
    "/summary": { category: DATASET_METADATA.category },
    "/slice": { category: DATASET_METADATA.category },
    "/full": { category: DATASET_METADATA.category },
    "/expert": { category: DATASET_METADATA.category },
    "/commission": { category: DATASET_METADATA.category },
    "/research/law-before-code": { category: "governance", subCategory: "law_before_code" },
    "/research/cryptographic-continuity": { category: "governance", subCategory: "cryptographic_continuity" },
    "/research/invisible-infrastructure": { category: "governance", subCategory: "invisible_infrastructure" },
    "/pacific/blockchain-adoption": { category: "governance", subCategory: "blockchain_adoption" },
  };

  // Boot-time sanity check only (warn, never crash — same posture as the
  // rest of this file): confirms every route above actually resolves to a
  // real endpoint row, so a listing/URL mismatch surfaces in logs at
  // deploy time rather than being discovered a day later the way
  // Session 19's silent transactions_log gap was (see CLAUDE.md §26.4-style
  // incidents). The result is discarded — logSettledPaymentContext below
  // still re-resolves fresh per settlement, never reuses this.
  for (const [path, { category, subCategory }] of Object.entries(ROUTE_DATASET)) {
    const ctx = await resolveDirectoryContext(supabase, env.PUBLIC_URL, category, subCategory);
    if (!ctx) {
      logger.warn("pilot_endpoint_route_unresolved_at_boot", { path, category, subCategory, public_url: env.PUBLIC_URL });
    }
  }

  // ── x402 payment gate (via @pdc/x402-adapter — never import @x402/* directly, R1) ──
  // Session 24 — merchantIdentity applied to every route's RouteConfig
  // (see PdcMerchantIdentity's doc comment in the adapter for why this is
  // set once here rather than per-route): without it, GoPlausible's
  // dashboard has nothing but the raw payTo address to show for this
  // service.
  const paymentGate = new PdcPaymentGate({
    payToAddress: env.AVM_ADDRESS,
    facilitatorUrl: env.FACILITATOR_URL,
    network: env.ALGORAND_NETWORK,
    merchantIdentity: {
      serviceName: "Pacific Data Commons",
      description: "Sovereign data marketplace for Pacific Island institutions. AI agents pay Pacific institutions directly in USDC per query.",
      // TODO(session40): apps/web is migrating Railway -> Cloudflare Pages,
      // custom domain not yet confirmed (see MIGRATION.md) — update once
      // known. Left as the stale Railway URL rather than a guessed domain.
      url: "https://pdcweb-production.up.railway.app",
      iconUrl: "https://pdcweb-production.up.railway.app/images/sbp-logo.png",
      tags: ["data-marketplace", "pacific", "sovereign-infrastructure", "ai-agents"],
    },
  });

  // Session 19 — every settled payment on the paid routes below now logs
  // to transactions_log (previously never written anywhere from this
  // process — see types/env.ts's doc comment). Session 21: context is
  // resolved fresh per settlement (not once at boot) so each dataset's
  // route attributes to its own endpoint_id — see ROUTE_DATASET above and
  // resolveDirectoryContext's doc comment for why that matters now that
  // this process serves more than one dataset.
  paymentGate.onSettled(async (payment) => {
    const bare = payment.path.split("?")[0] ?? payment.path;
    const mapping = ROUTE_DATASET[bare];
    const context = mapping ? await resolveDirectoryContext(supabase, env.PUBLIC_URL, mapping.category, mapping.subCategory) : null;
    await logSettledEndpointPayment(supabase, payment, context);
  });

  // Bazaar discovery metadata (Session 8.1) — extension objects built with
  // @x402-avm/extensions' declareDiscoveryExtension, a pure data-shape
  // builder with no coupling to any particular x402 core implementation.
  // @x402/core has its own native support for the "extensions.bazaar" wire
  // field (checkIfBazaarNeeded / enrichExtensions in @x402/core/server), so
  // the discovery object just needs to be attached at
  // RouteConfig.extensions.bazaar via PdcPaidRouteSpec.extensions — see
  // packages/pdc-x402-adapter.
  //
  // `paidRoutes` (imported above) lives in ./routeSchemas.ts, not inline
  // here, specifically so routeSchemas.test.ts can call ajv.compile() on
  // every route's discovery.schema directly in Node at test time — see that
  // test for what it's guarding against. See
  // packages/pdc-x402-adapter/src/bazaarAjvWorkersLogFilter.ts for why that
  // Node-time compile always succeeds even though the identical compile
  // fails at request time in the deployed Cloudflare Worker (a platform
  // restriction on @x402/hono's own internal bazaar self-check, not a
  // schema defect — Node has no such restriction).

  for (const route of paidRoutes) {
    paymentGate.addRoute({
      method: route.method,
      path: route.path,
      priceUsdc: TIER_PRICING[route.tier],
      description: route.description,
      // Session 22: was `pdc-pilot-endpoint:${route.path}`, a URN-style
      // label rather than a fetchable URL. Confirmed live (curling this
      // endpoint's own /summary and decoding its 402 PAYMENT-REQUIRED
      // header) that this string reaches the facilitator verbatim as
      // `resource.url`, and that GoPlausible's Bazaar catalog can't build a
      // real, crawlable catalog entry from it — the one stale entry it had
      // indexed showed up as resourceUrl "null/summary". A real URL is what
      // Bazaar discovery needs to actually list and let agents call this
      // resource.
      resource: `${env.PUBLIC_URL}${route.path}`,
      extra: {
        service: "pacific-data-commons-pilot",
        category: route.category ?? DATASET_METADATA.category,
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

  // Mounted globally but only intercepts the paths registered above —
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
  app.route("/", researchRoute);
  app.route("/", pacificAdoptionRoute);

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
          `/research/law-before-code (${formatUsdc(TIER_PRICING.summary)}, ?tier=summary|slice|full)`,
          `/research/cryptographic-continuity (${formatUsdc(TIER_PRICING.summary)}, ?tier=summary|slice|full)`,
          `/research/invisible-infrastructure (${formatUsdc(TIER_PRICING.summary)}, ?tier=summary|slice|full)`,
          `/pacific/blockchain-adoption (${formatUsdc(TIER_PRICING.summary)})`,
        ],
        timestamp: new Date().toISOString(),
      },
      404,
    ),
  );

  app.onError(errorHandlerMiddleware);

  return app;
}
