import { createServiceClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/onboarding/slug";
import type { DataCategory, Endpoint, Provider } from "@pdc/shared-types";

// endpoints.geography_country is inconsistently populated in practice —
// most rows store ISO2 codes (["VU"]), a few store full names directly
// (["Samoa", "Tonga"]), and multi-country rows (RSE corridor, blockchain
// adoption) list several. Only a single-country row has one unambiguous
// jurisdiction to show, so this maps that one entry to a display name when
// it's a code, passes it through unchanged when it's already a name, and
// falls back to the provider's own country for null/multi-country rows —
// same as every endpoint's existing (pre-Vanuatu) behavior.
const ISO2_TO_COUNTRY_NAME: Record<string, string> = {
  WS: "Samoa",
  FJ: "Fiji",
  TO: "Tonga",
  VU: "Vanuatu",
  PG: "Papua New Guinea",
  SB: "Solomon Islands",
  KI: "Kiribati",
  TV: "Tuvalu",
  NR: "Nauru",
  MH: "Marshall Islands",
  FM: "Micronesia",
  PW: "Palau",
};

function resolveCountryLabel(geographyCountry: string[] | null | undefined, providerCountry: string): string {
  if (!geographyCountry || geographyCountry.length !== 1) return providerCountry;
  const value = geographyCountry[0];
  if (!value) return providerCountry;
  return ISO2_TO_COUNTRY_NAME[value] ?? value;
}

export interface PublicListing {
  providerSlug: string;
  datasetSlug: string;
  title: string;
  description: string;
  category: DataCategory;
  institutionName: string;
  country: string;
  trustTier: Provider["trust_tier"];
  /** Real verified-purchaser upvote count (community_ratings) — never
   * hardcoded to 0. TrustTierBadge renders "Community Verified — N buyers"
   * for Silver; showing a fabricated 0 there would misstate an actual
   * provider's community rating (P10 — SBP records community signals
   * accurately, it doesn't approximate them for a listing page). */
  upvoteCount: number;
  lowestPriceUsdc: number;
  /** Mirrors endpoints.human_deliverable (migration 20261018000002) — drives
   * the browse page's two-tier split: human-purchasable vs agent-API-only.
   * Read straight off the row; `select("*")` below already fetches it, no
   * query change needed, only this pass-through into the listing shape. */
  humanDeliverable: boolean;
}

/**
 * Buyer-facing browse listing (Session 19, Fix 4) — same service-role,
 * no-x402 read pattern as get-public-dataset.ts (this is SBP's own website
 * rendering its own directory for free browsing; charging its own page
 * load the $0.01 directory-query fee via the paid /search route would be
 * wrong — that fee is for x402 agent/buyer queries, not for a human
 * scrolling a marketing page). POC scale (see get-public-dataset.ts's
 * identical note) — filtering/sorting in application code rather than a
 * paginated SQL query is fine here, not a pattern to keep at directory
 * scale.
 */
export async function listPublicEndpoints(filters: { category?: string; q?: string } = {}): Promise<PublicListing[]> {
  const supabase = createServiceClient();

  const { data: providers } = await supabase.from("providers").select("*").eq("is_active", true);
  const providerById = new Map(((providers ?? []) as Provider[]).map((p) => [p.id, p]));
  if (providerById.size === 0) return [];

  let query = supabase.from("endpoints").select("*").eq("is_active", true).in("provider_id", Array.from(providerById.keys()));
  if (filters.category) {
    query = query.eq("data_category", filters.category);
  }
  const { data: endpoints } = await query;

  const q = filters.q?.trim().toLowerCase();
  const filtered = ((endpoints ?? []) as Endpoint[]).filter((endpoint) => {
    if (!q) return true;
    return endpoint.title.toLowerCase().includes(q) || endpoint.description.toLowerCase().includes(q);
  });

  const listings = await Promise.all(
    filtered.map(async (endpoint): Promise<PublicListing | null> => {
      const provider = providerById.get(endpoint.provider_id);
      if (!provider) return null;
      const lowestPriceUsdc = endpoint.pricing_tiers.reduce(
        (min, tier) => (tier.price_usdc < min ? tier.price_usdc : min),
        endpoint.pricing_tiers[0]?.price_usdc ?? 0,
      );
      const { count } = await supabase
        .from("community_ratings")
        .select("id", { count: "exact", head: true })
        .eq("endpoint_id", endpoint.id)
        .eq("rating", "positive")
        .eq("query_verified", true);
      return {
        providerSlug: slugify(provider.institution_name),
        datasetSlug: slugify(endpoint.title),
        title: endpoint.title,
        description: endpoint.description,
        category: endpoint.data_category,
        institutionName: provider.institution_name,
        country: resolveCountryLabel(endpoint.geography_country, provider.country),
        trustTier: provider.trust_tier,
        upvoteCount: count ?? 0,
        lowestPriceUsdc,
        humanDeliverable: endpoint.human_deliverable,
      };
    }),
  );

  return listings.filter((listing): listing is PublicListing => listing !== null);
}
