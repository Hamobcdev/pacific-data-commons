import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, ValidationError } from "../lib/errors.js";

/** Pacific Tourism Data Framework — Phase B. Backs routes/tourism/tourism-food-markets.ts. */

export const VALID_VENUE_TYPES = new Set([
  "restaurant", "bar", "cafe", "market_stall", "food_tour", "catering_service",
  "kava_bar", "night_market", "food_truck", "hotel_restaurant", "beach_bar",
]);
export const VALID_DINING_TIERS = new Set(["street_food", "casual", "mid_range", "fine_dining", "buffet", "multiple"]);
export const VALID_SOURCE_TYPES = new Set(["curated", "provider_self_listed", "hybrid"]);
export const VALID_MARKET_TYPES = new Set(["produce", "craft", "fish", "mixed", "flea", "night_market", "farmers_market"]);
export const VALID_DAYS = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "public_holiday",
]);

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

function parseBool(raw: string | undefined, paramName: string): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ValidationError(`${paramName} must be "true" or "false", got "${raw}"`);
}

export interface FoodFilters {
  venueType?: string;
  cuisineType?: string;
  dietary?: string;
  diningTier?: string;
  kavaAvailable?: boolean;
  maxPricePerPerson?: number;
  sourceType?: string;
  limit: number;
  offset: number;
}

export function parseFoodFilters(query: {
  venue_type?: string;
  cuisine_type?: string;
  dietary?: string;
  dining_tier?: string;
  kava_available?: string;
  max_price_per_person?: string;
  source_type?: string;
  limit?: string;
  offset?: string;
}): FoodFilters {
  if (query.venue_type && !VALID_VENUE_TYPES.has(query.venue_type)) {
    throw new ValidationError(`venue_type must be one of: ${Array.from(VALID_VENUE_TYPES).join(", ")}`);
  }
  if (query.dining_tier && !VALID_DINING_TIERS.has(query.dining_tier)) {
    throw new ValidationError(`dining_tier must be one of: ${Array.from(VALID_DINING_TIERS).join(", ")}`);
  }
  if (query.source_type && !VALID_SOURCE_TYPES.has(query.source_type)) {
    throw new ValidationError(`source_type must be one of: ${Array.from(VALID_SOURCE_TYPES).join(", ")}`);
  }

  const maxPricePerPerson = query.max_price_per_person !== undefined ? Number(query.max_price_per_person) : undefined;
  if (maxPricePerPerson !== undefined && (Number.isNaN(maxPricePerPerson) || maxPricePerPerson < 0)) {
    throw new ValidationError("max_price_per_person must be a non-negative number");
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit ?? String(DEFAULT_LIMIT)) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(query.offset ?? "0") || 0);

  return {
    venueType: query.venue_type,
    cuisineType: query.cuisine_type,
    dietary: query.dietary,
    diningTier: query.dining_tier,
    kavaAvailable: parseBool(query.kava_available, "kava_available"),
    maxPricePerPerson,
    sourceType: query.source_type,
    limit,
    offset,
  };
}

export async function queryFoodBeverage(supabase: SupabaseClient, nationCode: string, filters: FoodFilters) {
  let query = supabase
    .from("tourism_food_beverage")
    .select("*", { count: "exact" })
    .eq("nation_code", nationCode);

  if (filters.venueType) query = query.eq("venue_type", filters.venueType);
  if (filters.cuisineType) query = query.contains("cuisine_types", [filters.cuisineType]);
  if (filters.dietary) query = query.contains("dietary_options", [filters.dietary]);
  if (filters.diningTier) query = query.eq("dining_tier", filters.diningTier);
  if (filters.kavaAvailable !== undefined) query = query.eq("kava_available", filters.kavaAvailable);
  if (filters.maxPricePerPerson !== undefined) query = query.lte("price_per_person_max_usd", filters.maxPricePerPerson);
  if (filters.sourceType) query = query.eq("source_type", filters.sourceType);

  query = query.range(filters.offset, filters.offset + filters.limit - 1).order("venue_name", { ascending: true });

  const { data, error, count } = await query;
  if (error) {
    throw new AppError(502, "database_error", `tourism_food_beverage query failed: ${error.message}`);
  }

  // nft_discount_active is a plain inert stub column — always false for
  // now, already present on every row via select("*"). Surfaced as-is so
  // agents can see the field exists ahead of the future TipTide build.
  return { results: data ?? [], totalCount: count ?? (data ?? []).length };
}

export async function queryMarkets(
  supabase: SupabaseClient,
  nationCode: string,
  params: { marketType?: string; day?: string },
) {
  if (params.marketType && !VALID_MARKET_TYPES.has(params.marketType)) {
    throw new ValidationError(`market_type must be one of: ${Array.from(VALID_MARKET_TYPES).join(", ")}`);
  }
  if (params.day && !VALID_DAYS.has(params.day.toLowerCase())) {
    throw new ValidationError(`day must be one of: ${Array.from(VALID_DAYS).join(", ")}`);
  }

  let query = supabase.from("tourism_markets").select("*").eq("nation_code", nationCode);
  if (params.marketType) query = query.eq("market_type", params.marketType);
  if (params.day) query = query.contains("operating_days", [params.day.toLowerCase()]);

  const { data, error } = await query.order("market_name", { ascending: true });
  if (error) {
    throw new AppError(502, "database_error", `tourism_markets query failed: ${error.message}`);
  }

  return data ?? [];
}
