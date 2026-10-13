import { Hono } from "hono";
import { TIER_PRICING, formatUsdc } from "../../lib/pricing.js";
import { DATASET_METADATA } from "../../data/fisheries.js";
import { LAW_BEFORE_CODE, CRYPTOGRAPHIC_CONTINUITY, INVISIBLE_INFRASTRUCTURE } from "../../data/research.js";
import { PACIFIC_ADOPTION_METADATA } from "../../data/pacificAdoption.js";
import type { AppBindings } from "../../types.js";

const SERVICE_NAME = "Pacific Data Commons";

/**
 * PR #147 Part 2 — x402 agent discovery manifest for this Worker's own
 * domain. This service never had a discovery document of its own before;
 * its 9 paid routes were absent from every manifest (apps/web's
 * /.well-known/x402 and directory-api's /.well-known/x402-directory.json
 * both only ever covered directory-api's routes). Mirrors apps/web's same
 * 9 entries (PR #147 Part 1b) so a crawler hitting this domain directly
 * gets the same information without depending on the other service being
 * up.
 *
 * /climate/pacific-coral-bleaching and /climate/pacific-enso-index are
 * NOT listed here — both are served by directory-api, not this Worker
 * (confirmed against ../../routeSchemas.ts).
 */
export const wellKnownX402Route = new Hono<AppBindings>();

wellKnownX402Route.get("/.well-known/x402", (c) => {
  const env = c.get("env");
  const publicUrl = env.PUBLIC_URL.replace(/\/$/, "");
  const payTo = env.AVM_ADDRESS;
  // This Worker has no [assets] block or public/ directory of its own
  // (confirmed — unlike apps/directory-api and apps/web) — pointing at
  // ${publicUrl}/images/sbp-logo.png would 404. Reuses directory-api's
  // already-live copy instead, the same URL this app's own
  // merchantIdentity.iconUrl already uses (see createApp() above).
  const iconUrl = "https://api.synergybcpacific.com/images/sbp-logo.png";

  const entry = (path: string, price: number, description: string, category: string, tags: string[]) => ({
    path,
    full_url: `${publicUrl}${path}`,
    price_usdc: formatUsdc(price).slice(1),
    description,
    category,
    pay_to: payTo,
    trust_tier: "bronze" as const,
    data_format: "json" as const,
    tags,
    serviceName: SERVICE_NAME,
    iconUrl,
  });

  return c.json(
    {
      version: "1.0",
      provider: SERVICE_NAME,
      operator: "Synergy Blockchain Pacific",
      description: `SBP Pilot Endpoint — ${DATASET_METADATA.title} and SBP governance working papers, x402-gated for AI agents and researchers.`,
      currency: "USDC",
      network: `algorand-${env.ALGORAND_NETWORK}`,
      facilitator: env.FACILITATOR_URL,
      leaderboard_tag: "x402-global-challenge",
      contact: "anthony@synergybcpacific.com",
      endpoints: [
        entry(
          "/summary",
          TIER_PRICING.summary,
          `Key findings summary for ${DATASET_METADATA.title}. SYNTHETIC DEMO DATA.`,
          "fisheries",
          ["pacific", "fisheries", "tuna", "stock-assessment", "demo"],
        ),
        entry(
          "/slice",
          TIER_PRICING.slice,
          "Filtered tuna data slice by species/year/zone. SYNTHETIC DEMO DATA.",
          "fisheries",
          ["pacific", "fisheries", "tuna", "filtered", "demo"],
        ),
        entry(
          "/full",
          TIER_PRICING.full,
          "Complete synthetic tuna dataset — all records, species, years, zones.",
          "fisheries",
          ["pacific", "fisheries", "tuna", "dataset", "demo"],
        ),
        entry(
          "/expert",
          TIER_PRICING.expert,
          "Full dataset plus methodology notes and citation-ready stock assessment interpretation.",
          "fisheries",
          ["pacific", "fisheries", "tuna", "methodology", "demo"],
        ),
        entry(
          "/commission",
          TIER_PRICING.commission,
          "Custom commissioned Pacific fisheries analysis — SBP follows up within 48 hours.",
          "fisheries",
          ["pacific", "fisheries", "custom", "commission", "analysis"],
        ),
        entry(
          "/research/law-before-code",
          TIER_PRICING.summary,
          `Structured metadata for "${LAW_BEFORE_CODE.title}".`,
          "governance",
          ["pacific", "governance", "policy", "samoa", "digital-infrastructure"],
        ),
        entry(
          "/research/cryptographic-continuity",
          TIER_PRICING.summary,
          `Structured metadata for "${CRYPTOGRAPHIC_CONTINUITY.title}".`,
          "governance",
          ["pacific", "governance", "security", "cryptography", "policy"],
        ),
        entry(
          "/research/invisible-infrastructure",
          TIER_PRICING.summary,
          `Structured metadata for "${INVISIBLE_INFRASTRUCTURE.title}".`,
          "governance",
          ["pacific", "governance", "dlt", "fraud", "standards"],
        ),
        entry(
          "/pacific/blockchain-adoption",
          TIER_PRICING.summary,
          `${PACIFIC_ADOPTION_METADATA.dataset} — ${PACIFIC_ADOPTION_METADATA.coverage}.`,
          "governance",
          ["pacific", "blockchain", "adoption", "cbdc", "digital-economy"],
        ),
      ],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
});
