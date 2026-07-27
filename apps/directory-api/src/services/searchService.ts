import type { SupabaseClient } from "@supabase/supabase-js";
import { isDataCategory } from "../lib/dataCategories.js";
import { AppError } from "../lib/errors.js";
import type {
  DirectorySearchResult as SearchResult,
  DirectorySearchResultItem as SearchResultItem,
  Endpoint as EndpointRow,
  Provider as ProviderRow,
} from "@pdc/shared-types";
import { toPublicEndpoint, toPublicProvider } from "./publicProjections.js";

export type { DirectorySearchResult as SearchResult, DirectorySearchResultItem as SearchResultItem } from "@pdc/shared-types";

export interface SearchFilters {
  category?: string;
  country?: string;
  trustTier?: "bronze" | "silver" | "gold";
  priceMax?: number;
  timePeriodStart?: number;
  keywords?: string;
  page: number;
  limit: number;
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export function parseSearchFilters(query: URLSearchParams): SearchFilters {
  const category = query.get("category") ?? undefined;
  if (category && !isDataCategory(category)) {
    throw new AppError(400, "invalid_request", `Unknown category "${category}"`);
  }

  const trustTierRaw = query.get("trust_tier") ?? undefined;
  if (trustTierRaw && !["bronze", "silver", "gold"].includes(trustTierRaw)) {
    throw new AppError(400, "invalid_request", `Unknown trust_tier "${trustTierRaw}"`);
  }

  const priceMaxRaw = query.get("price_max");
  const priceMax = priceMaxRaw !== null ? Number(priceMaxRaw) : undefined;
  if (priceMax !== undefined && (Number.isNaN(priceMax) || priceMax < 0)) {
    throw new AppError(400, "invalid_request", "price_max must be a non-negative number");
  }

  const timePeriodStartRaw = query.get("time_period_start");
  const timePeriodStart = timePeriodStartRaw !== null ? Number(timePeriodStartRaw) : undefined;
  if (timePeriodStart !== undefined && !Number.isInteger(timePeriodStart)) {
    throw new AppError(400, "invalid_request", "time_period_start must be an integer year");
  }

  const page = Math.max(1, Number(query.get("page") ?? "1") || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.get("limit") ?? String(DEFAULT_LIMIT)) || DEFAULT_LIMIT));

  return {
    category,
    country: query.get("country") ?? undefined,
    trustTier: trustTierRaw as SearchFilters["trustTier"],
    priceMax,
    timePeriodStart,
    keywords: query.get("keywords") ?? undefined,
    page,
    limit,
  };
}

interface PricingTier {
  tier: number;
  price_usdc: number;
}

function endpointHasAffordableTier(pricingTiers: unknown, priceMax: number): boolean {
  if (!Array.isArray(pricingTiers)) return false;
  return (pricingTiers as PricingTier[]).some(
    (tier) => typeof tier.price_usdc === "number" && tier.price_usdc <= priceMax,
  );
}

/**
 * PDC international layer only (P3: jurisdiction is OGIP-layer only — this
 * directory never surfaces OGIP-internal ministry-to-ministry endpoints,
 * those live in ogip_endpoints and are served by the separate OGIP internal
 * API). An endpoint is discoverable here when it's live and either has no
 * government-track classification (a plain international provider) or is
 * explicitly marked fully_commercial and public by that classification.
 */
export async function searchEndpoints(
  supabase: SupabaseClient,
  filters: SearchFilters,
): Promise<SearchResult> {
  let query = supabase
    .from("endpoints")
    .select("*, providers!inner(*)", { count: "exact" })
    .eq("is_active", true)
    .eq("providers.is_active", true)
    .or("sensitivity_level.is.null,sensitivity_level.eq.public")
    .or("commercial_eligibility.is.null,commercial_eligibility.eq.fully_commercial");

  if (filters.category) {
    query = query.eq("data_category", filters.category);
  }
  if (filters.country) {
    query = query.ilike("providers.country", `%${filters.country}%`);
  }
  if (filters.trustTier) {
    query = query.eq("providers.trust_tier", filters.trustTier);
  }
  if (filters.timePeriodStart !== undefined) {
    query = query.or(`time_period_end.gte.${filters.timePeriodStart},time_period_end.is.null`);
  }
  if (filters.keywords) {
    const escaped = filters.keywords.replace(/[%,]/g, "");
    query = query.or(
      `title.ilike.%${escaped}%,description.ilike.%${escaped}%,data_sub_category.ilike.%${escaped}%`,
    );
  }

  // Overfetch when a price filter is applied, since pricing_tiers is JSONB
  // and filtered in application code below; Postgres range window is applied
  // after that filter instead of in the query itself.
  const from = filters.priceMax !== undefined ? 0 : (filters.page - 1) * filters.limit;
  const to = filters.priceMax !== undefined ? MAX_LIMIT * 5 - 1 : from + filters.limit - 1;
  query = query.range(from, to).order("last_queried_at", { ascending: false, nullsFirst: false });

  const { data, error, count } = await query;
  if (error) {
    throw new AppError(502, "database_error", `Search query failed: ${error.message}`);
  }

  type Row = EndpointRow & { providers: ProviderRow };
  let rows = (data ?? []) as unknown as Row[];
  let totalCount = count ?? rows.length;

  if (filters.priceMax !== undefined) {
    // price_max is filtered here rather than in Postgres because pricing_tiers
    // is a JSONB array and the supabase-js query builder has no operator for
    // "any array element's price_usdc <= N". totalCount is therefore exact
    // only up to the overfetch window above (MAX_LIMIT * 5 rows) — fine for
    // the POC's provider count, but move this to a Postgres RPC
    // (search_endpoints_with_price_cap) before that stops being true.
    rows = rows.filter((row) => endpointHasAffordableTier(row.pricing_tiers, filters.priceMax as number));
    totalCount = rows.length;
    const start = (filters.page - 1) * filters.limit;
    rows = rows.slice(start, start + filters.limit);
  }

  return {
    results: rows.map((row) => ({
      endpoint: toPublicEndpoint(row),
      provider: toPublicProvider(row.providers),
    })),
    page: filters.page,
    limit: filters.limit,
    totalCount,
  };
}
