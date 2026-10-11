import { Hono } from "hono";
import { getCaip2Network } from "@pdc/x402-adapter";
import { AGENT_REGISTRY } from "@pdc/shared-types";
import { AGENT_DATASET_CATALOG, catalogCategoryToDataCategory } from "../lib/agentDatasetCatalog.js";
import type { AppBindings } from "../types.js";

/**
 * x402 agent discovery manifest at this service's own domain
 * (api.synergybcpacific.com/.well-known/x402). Added because agent
 * crawlers hitting the API domain directly — not apps/web's marketing
 * domain — found nothing here (404). Served inline rather than redirected
 * to apps/web's own /.well-known/x402: a cross-domain 301 for a
 * well-known discovery doc is unusual (RFC 8615 expects each domain to
 * serve its own resource in place), and this service is the actual
 * payment authority for every endpoint listed below — it has the
 * validated Env directly (env.AVM_ADDRESS), rather than needing a second,
 * independently-configured copy of the same wallet addresses the way
 * apps/web's equivalent route does.
 *
 * Deliberately NOT the same object as discovery.ts's own
 * /.well-known/x402-directory.json (schema_version "pdp-1.0", stats,
 * psr_spec, etc. — the Pacific Service Registry shape). This mirrors
 * apps/web's /.well-known/x402 field-for-field instead, since that's the
 * shape external x402 crawlers (not PDC's own PSR tooling) are expecting.
 */
export const wellKnownX402Route = new Hono<AppBindings>();

/**
 * Session 3 (Stream A completion) — this list used to be 4 hand-written
 * entries (samoa-cpi, ocean-temperature, samoa-gdp, search), stale since
 * before this app had 20+ first-party endpoints. Now derived from
 * lib/agentDatasetCatalog.ts's AGENT_DATASET_CATALOG (itself derived from
 * routeSchemas.ts's `paidRoutes`) so price/wallet here can never drift
 * out of sync with what a dataset's direct route actually charges — see
 * routes/discovery.ts's buildPaidEndpoints() for the identical reasoning
 * (why this lists each dataset's direct GET route, not the Agent Dataset
 * Gateway's single shared-price POST adapter).
 */
function buildEndpoints(env: AppBindings["Variables"]["env"], publicUrl: string) {
  return [
    {
      path: "/search",
      full_url: `${publicUrl}/search`,
      price_usdc: "0.01",
      description: "PDC directory search — query all registered Pacific data endpoints.",
      category: "directory",
      pay_to: env.AVM_ADDRESS,
      trust_tier: "directory" as const,
      data_format: "json" as const,
    },
    ...AGENT_DATASET_CATALOG.map((d) => ({
      path: d.path,
      full_url: `${publicUrl}${d.path}`,
      price_usdc: String(d.priceUsdc),
      description: d.description,
      category: catalogCategoryToDataCategory(d.category),
      pay_to: d.payToWallet ?? env.AVM_ADDRESS,
      trust_tier: "bronze" as const,
      data_format: "json" as const,
    })),
  ];
}

function buildAgentCatalogue() {
  return Object.values(AGENT_REGISTRY).map((agent) => ({
    id: agent.slug,
    name: agent.name,
    categories: agent.categories,
  }));
}

wellKnownX402Route.get("/.well-known/x402", async (c) => {
  const env = c.get("env");
  const publicUrl = env.PUBLIC_URL;
  const webAppUrl = env.WEB_APP_URL ?? null;

  c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  c.header("Access-Control-Allow-Origin", "*");

  return c.json({
    version: "1.0",
    provider: "Pacific Data Commons",
    operator: "Synergy Blockchain Pacific",
    description:
      "Sovereign Pacific data directory — x402-gated endpoints for AI agents and researchers. " +
      "Built on Algorand. Data sovereignty enforced — providers control their own infrastructure.",
    currency: "USDC",
    network: `algorand-${env.ALGORAND_NETWORK}`,
    caip2: getCaip2Network(env.ALGORAND_NETWORK),
    facilitator: env.FACILITATOR_URL,
    leaderboard_tag: "x402-global-challenge",
    contact: "anthony@synergybcpacific.com",
    docs: webAppUrl ? `${webAppUrl}/en/developers` : null,
    directory_manifest: `${publicUrl}/.well-known/x402-directory.json`,
    rating_api: `${publicUrl}/rate`,
    categories: [
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
    ],
    endpoints: buildEndpoints(env, publicUrl),
    agents: {
      marketplace_url: webAppUrl ? `${webAppUrl}/en/agents` : null,
      api_base: null,
      catalogue: buildAgentCatalogue(),
    },
    trust_tiers: {
      bronze: "Identity verified — institutional email, registry, wallet, contact",
      silver: "Community verified — 3+ wallet-signed upvotes from verified buyers",
      gold: "Peer reviewed — DOI verified against CrossRef, COI declaration published",
    },
  });
});

wellKnownX402Route.options("/.well-known/x402", (c) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");
  return c.body(null, 204);
});
