import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, ValidationError } from "../lib/errors.js";

/** Pacific Tourism Data Framework — Phase B. Backs routes/tourism/tourism-accommodation.ts. */

export const VALID_PROPERTY_TYPES = new Set([
  "hotel", "resort", "guesthouse", "beach_fale", "homestay", "overwater_bungalow",
  "villa", "backpacker_hostel", "boutique_hotel", "eco_lodge", "motel",
]);

export const VALID_SOURCE_TYPES = new Set(["curated", "provider_self_listed", "hybrid"]);

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export interface AccommodationFilters {
  propertyType?: string;
  maxPriceUsd?: number;
  minPriceUsd?: number;
  hasPool?: boolean;
  hasSpa?: boolean;
  hasConference?: boolean;
  hasCasino?: boolean;
  hasWeddingVenue?: boolean;
  starRatingMin?: number;
  sourceType?: string;
  limit: number;
  offset: number;
}

function parseBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ValidationError(`Expected "true" or "false", got "${raw}"`);
}

export function parseAccommodationFilters(query: {
  property_type?: string;
  max_price_usd?: string;
  min_price_usd?: string;
  has_pool?: string;
  has_spa?: string;
  has_conference?: string;
  has_casino?: string;
  has_wedding_venue?: string;
  star_rating_min?: string;
  source_type?: string;
  limit?: string;
  offset?: string;
}): AccommodationFilters {
  if (query.property_type && !VALID_PROPERTY_TYPES.has(query.property_type)) {
    throw new ValidationError(`property_type must be one of: ${Array.from(VALID_PROPERTY_TYPES).join(", ")}`);
  }
  if (query.source_type && !VALID_SOURCE_TYPES.has(query.source_type)) {
    throw new ValidationError(`source_type must be one of: ${Array.from(VALID_SOURCE_TYPES).join(", ")}`);
  }

  const maxPriceUsd = query.max_price_usd !== undefined ? Number(query.max_price_usd) : undefined;
  if (maxPriceUsd !== undefined && (Number.isNaN(maxPriceUsd) || maxPriceUsd < 0)) {
    throw new ValidationError("max_price_usd must be a non-negative number");
  }
  const minPriceUsd = query.min_price_usd !== undefined ? Number(query.min_price_usd) : undefined;
  if (minPriceUsd !== undefined && (Number.isNaN(minPriceUsd) || minPriceUsd < 0)) {
    throw new ValidationError("min_price_usd must be a non-negative number");
  }
  const starRatingMin = query.star_rating_min !== undefined ? Number(query.star_rating_min) : undefined;
  if (starRatingMin !== undefined && (Number.isNaN(starRatingMin) || starRatingMin < 0 || starRatingMin > 5)) {
    throw new ValidationError("star_rating_min must be a number between 0 and 5");
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit ?? String(DEFAULT_LIMIT)) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(query.offset ?? "0") || 0);

  return {
    propertyType: query.property_type,
    maxPriceUsd,
    minPriceUsd,
    hasPool: parseBool(query.has_pool),
    hasSpa: parseBool(query.has_spa),
    hasConference: parseBool(query.has_conference),
    hasCasino: parseBool(query.has_casino),
    hasWeddingVenue: parseBool(query.has_wedding_venue),
    starRatingMin,
    sourceType: query.source_type,
    limit,
    offset,
  };
}

export async function queryAccommodations(
  supabase: SupabaseClient,
  nationCode: string,
  filters: AccommodationFilters,
) {
  let query = supabase
    .from("tourism_accommodations")
    .select("*", { count: "exact" })
    .eq("nation_code", nationCode);

  if (filters.propertyType) query = query.eq("property_type", filters.propertyType);
  // max_price_usd/min_price_usd filter on the mid-range price band — the
  // realistic default comparison tier per the framework's own pricing
  // design (budget/midrange/luxury bands, see the migration's doc comment).
  if (filters.maxPriceUsd !== undefined) query = query.lte("price_midrange_max_usd", filters.maxPriceUsd);
  if (filters.minPriceUsd !== undefined) query = query.gte("price_midrange_min_usd", filters.minPriceUsd);
  if (filters.hasPool !== undefined) query = query.eq("has_pool", filters.hasPool);
  if (filters.hasSpa !== undefined) query = query.eq("has_spa", filters.hasSpa);
  if (filters.hasConference !== undefined) query = query.eq("has_conference_facilities", filters.hasConference);
  if (filters.hasCasino !== undefined) query = query.eq("has_casino", filters.hasCasino);
  if (filters.hasWeddingVenue !== undefined) query = query.eq("is_wedding_venue", filters.hasWeddingVenue);
  if (filters.sourceType) query = query.eq("source_type", filters.sourceType);
  // star_rating_min matches either the officially-certified rating or the
  // self-declared one — most Pacific properties have no national rating
  // body (see intelligence report §1.3), so self-declared is frequently the
  // only populated value.
  if (filters.starRatingMin !== undefined) {
    query = query.or(`star_rating_official.gte.${filters.starRatingMin},star_rating_self_declared.gte.${filters.starRatingMin}`);
  }

  query = query.range(filters.offset, filters.offset + filters.limit - 1).order("property_name", { ascending: true });

  const { data, error, count } = await query;
  if (error) {
    throw new AppError(502, "database_error", `tourism_accommodations query failed: ${error.message}`);
  }

  return { results: data ?? [], totalCount: count ?? (data ?? []).length };
}

const CONFERENCE_COLUMNS = [
  "property_name",
  "property_type",
  "conference_max_capacity_theatre",
  "conference_max_capacity_banquet",
  "conference_breakout_rooms",
  "conference_av_standard",
  "conference_catering_inhouse",
  "conference_outdoor_space",
  "conference_outdoor_capacity",
  "largest_event_hosted",
  "distance_to_airport_km",
  "data_confidence",
].join(", ");

export async function queryAccommodationConferences(supabase: SupabaseClient, nationCode: string) {
  const { data, error } = await supabase
    .from("tourism_accommodations")
    .select(CONFERENCE_COLUMNS)
    .eq("nation_code", nationCode)
    .eq("has_conference_facilities", true)
    .order("conference_max_capacity_theatre", { ascending: false, nullsFirst: false });

  if (error) {
    throw new AppError(502, "database_error", `tourism_accommodations conferences query failed: ${error.message}`);
  }

  return data ?? [];
}
