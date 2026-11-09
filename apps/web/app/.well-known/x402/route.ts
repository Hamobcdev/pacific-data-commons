import { NextResponse } from "next/server";
import { AGENT_REGISTRY } from "@pdc/shared-types";
import type { Endpoint, Provider } from "@pdc/shared-types";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * x402 agent discovery manifest, served at the web app's own domain
 * (apps/web, Render service pdc-web) — distinct from
 * apps/directory-api/src/routes/discovery.ts's `/.well-known/x402-directory.json`,
 * which is served at api.synergybcpacific.com and is directory-api's own
 * resource-server manifest. External crawlers (e.g. Walter Hawkins'
 * Algorand agents) poll the web domain for `/.well-known/x402`; this route
 * is the first thing to exist at that path — it did not exist before.
 *
 * CAIP-2 identifiers below are copied from @x402/avm (ALGORAND_MAINNET_CAIP2 /
 * ALGORAND_TESTNET_CAIP2) rather than imported: apps/web has no runtime
 * dependency on any @x402/* package (CLAUDE.md's "always via
 * pdc-x402-adapter, never @x402 directly" rule governs live payment code
 * paths — this file is a static discovery document, not one), and adding
 * that dependency for one constant isn't warranted.
 */
const ALGORAND_MAINNET_CAIP2 = "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=";
const ALGORAND_TESTNET_CAIP2 = "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=";

// Same convention as lib/agents/algorand.ts: NEXT_PUBLIC_ALGORAND_NETWORK
// already exists in apps/web for this exact purpose.
const ALGORAND_NETWORK = process.env.NEXT_PUBLIC_ALGORAND_NETWORK === "testnet" ? "testnet" : "mainnet";
const CAIP2_NETWORK = ALGORAND_NETWORK === "testnet" ? ALGORAND_TESTNET_CAIP2 : ALGORAND_MAINNET_CAIP2;

/**
 * Multi-chain expansion (2026-11-09, feature/multi-chain-adapter) — adds
 * Base and Solana as *declared* supported payment chains alongside
 * Algorand. Deliberately does not touch which endpoints get listed below
 * (buildEndpoints(), DB-driven as of feature/manifest-cleanup): every
 * registered route still settles on Algorand only (pdc-x402-adapter's new
 * verifyAndSettleBase/Solana schemes are not yet wired into any live
 * route). This just lets Base/Solana-aware agent crawlers see what's
 * coming, gated behind PDC_MULTICHAIN_ENABLED so it can be toggled
 * without a redeploy.
 */
const MULTICHAIN_ENABLED = process.env.PDC_MULTICHAIN_ENABLED === "true";
const BASE_MAINNET_CAIP2 = "eip155:8453";
const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

/** Circle's official USDC addresses — same values verified in PR #209. */
const USDC_CONTRACT_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_MINT_SOLANA_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

interface SupportedChainEntry {
  chain: string;
  caip2: string;
  currency: "USDC";
  status: "primary" | "supported";
  /** Never fabricated — null only for the Algorand entry, which stays
   * unchanged from PR #209 and is never omitted even if unset. */
  merchant_address: string | null;
  /** EVM token contract address (Base only). */
  contract?: string;
  /** SPL token mint address (Solana only). */
  mint?: string;
}

/**
 * 2026-11-09 (feature/multichain-manifest) — unlike the Algorand entry
 * below (unchanged from PR #209, always included even with a null
 * merchant_address), Base and Solana are each omitted entirely — with a
 * console.warn, never a thrown error — when their merchant address env
 * var isn't set. Matches buildEndpoints()'s own established "don't
 * publish a chain/route we can't actually route to" posture elsewhere in
 * this file, which PR #209's version of this function didn't yet follow
 * for the two new chains.
 */
function buildSupportedChains(): SupportedChainEntry[] {
  const chains: SupportedChainEntry[] = [
    {
      chain: `algorand-${ALGORAND_NETWORK}`,
      caip2: CAIP2_NETWORK,
      currency: "USDC",
      status: "primary",
      merchant_address: process.env.AVM_ADDRESS ?? null,
    },
  ];

  if (MULTICHAIN_ENABLED) {
    const baseMerchantAddress = process.env.PDC_BASE_MERCHANT_ADDRESS;
    if (baseMerchantAddress) {
      chains.push({
        chain: "base-mainnet",
        caip2: BASE_MAINNET_CAIP2,
        currency: "USDC",
        status: "supported",
        merchant_address: baseMerchantAddress,
        contract: USDC_CONTRACT_BASE_MAINNET,
      });
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        "x402_wellknown_manifest: PDC_MULTICHAIN_ENABLED is true but PDC_BASE_MERCHANT_ADDRESS is not set — omitting Base from supported_chains",
      );
    }

    const solanaMerchantAddress = process.env.PDC_SOLANA_MERCHANT_ADDRESS;
    if (solanaMerchantAddress) {
      chains.push({
        chain: "solana-mainnet",
        caip2: SOLANA_MAINNET_CAIP2,
        currency: "USDC",
        status: "supported",
        merchant_address: solanaMerchantAddress,
        mint: USDC_MINT_SOLANA_MAINNET,
      });
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        "x402_wellknown_manifest: PDC_MULTICHAIN_ENABLED is true but PDC_SOLANA_MERCHANT_ADDRESS is not set — omitting Solana from supported_chains",
      );
    }
  }

  return chains;
}

const DIRECTORY_API_URL = process.env.NEXT_PUBLIC_DIRECTORY_API_URL || "https://api.synergybcpacific.com";
// 2026-10-18 — the Render fallback here (pdc-web.onrender.com) is confirmed
// dead (CLAUDE.md Section 26.6, returns HTTP 503); apps/web is live on
// Vercel at pdc.synergybcpacific.com.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://pdc.synergybcpacific.com";

// 2026-11-09 (feature/manifest-cleanup) — PILOT_ENDPOINT_URL used to gate
// pilot-endpoint's 9 paid routes as a second hardcoded block (PR #147).
// Removed: buildEndpoints() below is now DB-driven, and each endpoints
// row carries its own endpoint_url (pilot-endpoint's row(s) included) —
// the per-row URL now does what this env var used to do, so gating on it
// a second time would be redundant, not protective. See buildEndpoints()'s
// own doc comment for the full reasoning, including an unresolved
// contradiction found in this same file's prior version: that PR's own
// comment claimed "pilot-endpoint stayed on Render, was never migrated to
// Workers," which conflicts with CLAUDE.md §26.6 (pilot-endpoint confirmed
// migrated to Cloudflare Workers, healthy) and with
// apps/pilot-endpoint/wrangler.toml's own PUBLIC_URL. Flagged in this PR's
// description rather than resolved here — it doesn't change this file's
// logic either way once the gate is per-row instead of per-env-var.

// Decision 8 — $0.01 per directory search. Not an env var: this is a
// published price, same posture as apps/directory-api/discovery.ts's own
// DIRECTORY_QUERY_PRICE_USDC constant.
const DIRECTORY_QUERY_PRICE_USDC = "0.01";

/**
 * 20 of the 21 real data categories (apps/directory-api/src/lib/dataCategories.ts
 * is the source of truth on the API side — that file's own doc comment
 * notes it must be kept in sync with the `endpoints.data_category` CHECK
 * constraint by hand, since directory-api is a separate deployable service
 * apps/web cannot import from). "cultural" is deliberately excluded here,
 * matching discovery.ts's own `DATA_CATEGORIES.filter((c) => c !== "cultural")`
 * — Decision 10: cultural data is "coming soon" only, not yet live for
 * discovery.
 */
const CATEGORIES = [
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
] as const;

interface ManifestEndpoint {
  path: string;
  full_url: string;
  price_usdc: string;
  description: string;
  category: string;
  pay_to: string;
  trust_tier: "bronze" | "directory";
  data_format: "json";
  /** x402 Bazaar discovery metadata (PR #147) — up to 5 relevant tags per endpoint. */
  tags: string[];
  serviceName: string;
  iconUrl: string;
}

// PR #147 — every entry shares the same service identity and icon;
// declared once rather than repeated per entry. ICON_URL points at the real
// logo asset (apps/web/public/images/sbp-logo.png) — the same file
// apps/directory-api/src/routes/branding.ts already uses for its own
// og:image, not a nonexistent /og-image.png.
const SERVICE_NAME = "Pacific Data Commons";
const ICON_URL = `${APP_URL}/images/sbp-logo.png`;

/**
 * Wallet addresses are read from the database (providers.wallet_address),
 * never hardcoded (CLAUDE.md P4 / §18). An endpoint whose provider has no
 * wallet set, or whose own endpoint_url is unset, is omitted from the
 * manifest entirely — same "don't fabricate an address" posture as
 * NEXT_PUBLIC_SBP_UPLOAD_FEE_WALLET and NEXT_PUBLIC_SBP_PAYTO_ADDRESS
 * elsewhere in apps/web/.env.example, now expressed per-row instead of
 * via the AVM_ADDRESS/PILOT_ENDPOINT_URL env vars this function used to
 * gate the two hardcoded blocks on.
 *
 * 2026-11-09 (feature/manifest-cleanup) — replaces the 41 hardcoded
 * entries this function used to return (not the 32 the file's own prior
 * comments claimed — recounted directly by grepping `path: "` in the
 * pre-rewrite version: 16 in one AVM_ADDRESS-gated block, 9 in the
 * PILOT_ENDPOINT_URL-gated block, 16 in a second AVM_ADDRESS-gated
 * block). Reads live `endpoints`/`providers` rows instead — same
 * service-role, two-separate-queries-merged-in-application-code pattern
 * as lib/directory/get-public-listings.ts (the browse page's own query),
 * which deliberately avoids a `providers!inner(...)` join: an `!inner`
 * join silently returns zero rows under a role without a public read
 * policy on the joined table (CLAUDE.md §26.1) — a real incident already
 * hit once on this exact pair of tables. Fetching providers and endpoints
 * separately and matching by provider_id in application code sidesteps
 * that class of bug entirely, at the POC scale this runs at.
 *
 * One `endpoints` row can carry multiple pricing_tiers entries (e.g.
 * pilot-endpoint's single row spanning tiers 1-5: summary/slice/full/
 * expert/commission) — each tier becomes its own manifest entry here,
 * same as the hardcoded version publishing 5 separate paths for that one
 * dataset.
 *
 * Does not cover `/search` below — that's directory-api's own discovery
 * meta-route (Decision 8's flat $0.01 charge), not a provider dataset, so
 * there is no `endpoints` row to read it from. Kept as the one remaining
 * hardcoded entry for that reason, not an oversight.
 *
 * Never throws: a Supabase failure here degrades the manifest to an
 * empty endpoints array (logged via console.error) plus whatever /search
 * still adds, rather than taking down the whole discovery route external
 * crawlers poll.
 */
async function buildEndpoints(): Promise<ManifestEndpoint[]> {
  const manifestEndpoints: ManifestEndpoint[] = [];

  try {
    const supabase = createServiceClient();

    const { data: providers, error: providersError } = await supabase.from("providers").select("*").eq("is_active", true);
    if (providersError) throw providersError;
    const providerById = new Map(((providers ?? []) as Provider[]).map((provider) => [provider.id, provider]));

    if (providerById.size > 0) {
      const { data: endpoints, error: endpointsError } = await supabase
        .from("endpoints")
        .select("*")
        .eq("is_active", true)
        .in("provider_id", Array.from(providerById.keys()));
      if (endpointsError) throw endpointsError;

      for (const endpoint of (endpoints ?? []) as Endpoint[]) {
        const provider = providerById.get(endpoint.provider_id);
        const payTo = provider?.wallet_address;
        const baseUrl = endpoint.endpoint_url;

        if (!provider || !payTo || !baseUrl) {
          // eslint-disable-next-line no-console
          console.warn(
            `x402_wellknown_manifest: endpoint ${endpoint.id} (${endpoint.title}) is missing ${
              !provider ? "its provider row" : !payTo ? "a provider wallet_address" : "an endpoint_url"
            } — omitting from manifest`,
          );
          continue;
        }

        for (const tier of endpoint.pricing_tiers ?? []) {
          manifestEndpoints.push({
            path: tier.path,
            full_url: `${baseUrl}${tier.path}`,
            price_usdc: tier.price_usdc.toString(),
            description: tier.description || endpoint.description,
            category: endpoint.data_category,
            pay_to: payTo,
            trust_tier: "bronze",
            data_format: "json",
            tags: buildEndpointTags(endpoint),
            serviceName: SERVICE_NAME,
            iconUrl: ICON_URL,
          });
        }
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      "x402_wellknown_manifest: failed to load endpoints from Supabase — returning manifest without DB-backed entries",
      error,
    );
  }

  // directory-api's own $0.01 directory search (Decision 8) — not a
  // provider dataset, so it has no `endpoints` row; stays hardcoded,
  // payTo'd to AVM_ADDRESS same as before this function went DB-driven.
  const directoryWallet = process.env.AVM_ADDRESS;
  if (directoryWallet) {
    manifestEndpoints.push({
      path: "/search",
      full_url: `${DIRECTORY_API_URL}/search`,
      price_usdc: DIRECTORY_QUERY_PRICE_USDC,
      description: "PDC directory search — query all registered Pacific data endpoints.",
      category: "directory",
      pay_to: directoryWallet,
      trust_tier: "directory",
      data_format: "json",
      tags: ["pacific", "directory", "search", "discovery", "metadata"],
      serviceName: SERVICE_NAME,
      iconUrl: ICON_URL,
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn("x402_wellknown_manifest: AVM_ADDRESS is not set — omitting /search from the discovery manifest");
  }

  return manifestEndpoints;
}

/**
 * Derived, not stored — the `endpoints` table has no free-form tags
 * column. Keeps the same up-to-5, lowercase-hyphenated convention the
 * hardcoded entries used, built only from columns that actually exist
 * (data_category, data_sub_category) rather than inventing per-endpoint
 * tag lists that can't be verified against anything.
 */
function buildEndpointTags(endpoint: Endpoint): string[] {
  const tags = ["pacific", endpoint.data_category.replace(/_/g, "-")];
  if (endpoint.data_sub_category) {
    tags.push(endpoint.data_sub_category.replace(/_/g, "-"));
  }
  return tags.slice(0, 5);
}

// @pdc/shared-types' AGENT_REGISTRY is the single source of truth for the
// 6 first-party agents (CLAUDE.md §26.2) — built dynamically here rather
// than hand-duplicated, so this manifest can't drift from the real
// marketplace catalogue the way the Session 8 "Flag 8" incident did.
function buildAgentCatalogue() {
  return Object.values(AGENT_REGISTRY).map((agent) => ({
    id: agent.slug,
    name: agent.name,
    categories: agent.categories,
  }));
}

export async function GET() {
  const endpoints = await buildEndpoints();

  return NextResponse.json(
    {
      version: "1.0",
      provider: "Pacific Data Commons",
      operator: "Synergy Blockchain Pacific",
      description:
        "Sovereign Pacific data directory — x402-gated endpoints for AI agents and researchers. " +
        "Built on Algorand. Data sovereignty enforced — providers control their own infrastructure.",
      currency: "USDC",
      network: `algorand-${ALGORAND_NETWORK}`,
      caip2: CAIP2_NETWORK,
      supported_chains: buildSupportedChains(),
      facilitator: "https://facilitator.goplausible.xyz",
      leaderboard_tag: "x402-global-challenge",
      contact: "anthony@synergybcpacific.com",
      docs: `${APP_URL}/en/developers`,
      directory_manifest: `${DIRECTORY_API_URL}/.well-known/x402-directory.json`,
      rating_api: `${DIRECTORY_API_URL}/rate`,
      categories: CATEGORIES,
      endpoints,
      agents: {
        marketplace_url: `${APP_URL}/en/agents`,
        api_base: process.env.AGENTS_SERVICE_URL ?? null,
        catalogue: buildAgentCatalogue(),
      },
      trust_tiers: {
        bronze: "Identity verified — institutional email, registry, wallet, contact",
        silver: "Community verified — 3+ wallet-signed upvotes from verified buyers",
        gold: "Peer reviewed — DOI verified against CrossRef, COI declaration published",
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
