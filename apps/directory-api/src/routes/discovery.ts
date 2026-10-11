import { Hono } from "hono";
import { getCaip2Network } from "@pdc/x402-adapter";
import { DATA_CATEGORIES } from "../lib/dataCategories.js";
import { AGENT_DATASET_CATALOG, catalogCategoryToDataCategory } from "../lib/agentDatasetCatalog.js";
import type { AppBindings } from "../types.js";

export const discoveryRoute = new Hono<AppBindings>();

const DIRECTORY_QUERY_PRICE_USDC = 0.01;

async function getActiveProviderCount(supabase: AppBindings["Variables"]["supabase"]): Promise<number> {
  const { count } = await supabase.from("providers").select("*", { count: "exact", head: true }).eq("is_active", true);
  return count ?? 0;
}

async function getActiveEndpointCount(supabase: AppBindings["Variables"]["supabase"]): Promise<number> {
  const { count } = await supabase.from("endpoints").select("*", { count: "exact", head: true }).eq("is_active", true);
  return count ?? 0;
}

/**
 * Session 3 (Stream A completion) — GoPlausible's bazaar dashboard
 * (facilitator.goplausible.xyz) indexes endpoints from this manifest, and
 * was only showing the handful of first-party endpoints that existed
 * before the Agent Dataset Gateway's catalog did. Derived from
 * lib/agentDatasetCatalog.ts's AGENT_DATASET_CATALOG — itself derived
 * from routeSchemas.ts's `paidRoutes` — so a dataset's price or wallet
 * here can never drift out of sync with what actually gets charged at
 * its direct route. Lists each dataset's own direct GET route (its real
 * priced resource), not the Agent Dataset Gateway's POST
 * /api/v1/datasets/<id>/query adapter — even though that adapter now has
 * its own correctly-priced paidRoutes entry per dataset (Session 4 fix),
 * every one of those is gated by middleware/agentWalletAuth.ts on top of
 * payment, which a generic x402 crawler can't satisfy anyway (same reasoning as routeSchemas.ts's own
 * doc comment on that entry).
 */
function buildPaidEndpoints(directoryApiUrl: string) {
  return AGENT_DATASET_CATALOG.map((d) => ({
    path: d.path,
    full_url: `${directoryApiUrl}${d.path}`,
    method: d.method,
    price_usdc: d.priceUsdc,
    pay_to: d.payToWallet ?? null,
    category: catalogCategoryToDataCategory(d.category),
    description: d.description,
  }));
}

/**
 * Agent discovery file (CLAUDE.md Section 14 — x402 Global Challenge
 * requirement: "Agent discovery file live at /.well-known/x402-directory.json").
 * Free — no payment gate, registered outside paymentGate.middleware()'s
 * scope in index.ts (that middleware only intercepts paths added via
 * addRoute(), and this path is never added).
 *
 * Placed flatly alongside health.ts/categories.ts/etc. rather than under a
 * routes/free/ subdirectory: apps/pilot-endpoint uses that split (it also
 * has paid routes to separate from), but every existing directory-api route
 * (health, categories, countries, search*, provider*, endpoint*, verify*)
 * already lives flat in routes/ — introducing one subdirectory for a single
 * new file here would be a one-off convention, not a fix to match a sibling
 * app's different structure.
 */
discoveryRoute.get("/.well-known/x402-directory.json", async (c) => {
  const env = c.get("env");
  const supabase = c.get("supabase");

  c.header("Cache-Control", "public, max-age=300");

  let stats: { active_providers: number; active_endpoints: number; last_updated: string; stats_error?: string };
  try {
    const [active_providers, active_endpoints] = await Promise.all([getActiveProviderCount(supabase), getActiveEndpointCount(supabase)]);
    stats = { active_providers, active_endpoints, last_updated: new Date().toISOString() };
  } catch (err) {
    // Discovery must always return 200 (agents poll this file) — a
    // Supabase blip degrades to zeroed, flagged stats rather than a 5xx.
    stats = { active_providers: 0, active_endpoints: 0, last_updated: new Date().toISOString(), stats_error: "temporarily unavailable" };
    // eslint-disable-next-line no-console
    console.error("discovery_stats_query_failed", err);
  }

  // Session 40 hotfix — was `process.env.DIRECTORY_API_URL ?? \`http://localhost:${env.PORT}\``,
  // a raw process.env read outside this service's validated env schema and
  // outside the Workers-safe `env` context variable worker.ts passes
  // through (see that file's doc comment) — it always fell through to the
  // localhost fallback in production on Cloudflare Workers. PUBLIC_URL is
  // the field already used for this exact purpose everywhere else in this
  // app (see app.ts's `resource: \`${env.PUBLIC_URL}${route.path}\``).
  const directoryApiUrl = env.PUBLIC_URL;

  return c.json({
    name: "Pacific Data Commons",
    version: "1.0.0",
    description: "Sovereign Pacific data directory — x402-gated endpoints for AI agents and researchers",
    schema_version: "pdp-1.0",
    network: getCaip2Network(env.ALGORAND_NETWORK),
    facilitator_url: env.FACILITATOR_URL,
    directory_endpoint: {
      url: `${directoryApiUrl}/search`,
      price_usdc: DIRECTORY_QUERY_PRICE_USDC,
      payment_required: true,
    },
    // Session 3 — Agent Dataset Gateway's full catalog of priced
    // first-party endpoints (see buildPaidEndpoints()'s doc comment).
    // Appended field, same posture as psr_spec/psr_schema below (P6, no
    // breaking change to this already-published manifest).
    endpoints: buildPaidEndpoints(directoryApiUrl),
    categories: DATA_CATEGORIES.filter((category) => category !== "cultural"),
    trust_tiers: {
      bronze: { label: "Identity Verified", price_cap_usd: 0.5, free_to_achieve: true },
      silver: { label: "Community Verified", requires: "3 verified purchaser upvotes", price_cap_usd: null },
      gold: { label: "Peer Reviewed", one_time_fee_usd: 25, annual_renewal_usd: 12.5 },
    },
    rating_api: {
      url: `${directoryApiUrl}/rate`,
      method: "POST",
      auth: "algorand_wallet_signed",
    },
    provenance_verification: {
      url: `${directoryApiUrl}/verify/{certificate_id}`,
      method: "GET",
    },
    competition_tag: "x402-global-challenge",
    bazaar_url: process.env.GOPLAUSIBLE_BAZAAR_URL ?? null,
    docs_url: process.env.PDC_DOCS_URL ?? "https://docs.pacificdatacommons.io",
    // Session 35 — Pacific Service Registry (PSR). Appended fields only;
    // nothing above this point was altered (P6, no breaking change to a
    // published discovery response).
    psr_spec: `${directoryApiUrl}/psr/v1/spec`,
    psr_schema: `${directoryApiUrl}/psr/v1/schema`,
    registry_name: "Pacific Service Registry",
    registry_version: "1.0.0",
    operated_by: "Synergy Blockchain Pacific Limited",
    stats,
    sbp_info: {
      name: "Synergy Blockchain Pacific",
      country: "Samoa",
      contact: process.env.SBP_CONTACT_EMAIL ?? "hello@synergyblockchainpacific.io",
      role: "Directory and payment infrastructure operator — not a data processor, quality assessor, or financial intermediary",
    },
  });
});
