import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, ValidationError } from "../lib/errors.js";

/** Pacific Tourism Data Framework — Phase B. Backs routes/tourism/tourism-activities.ts. */

export const VALID_ACTIVITY_TYPES = new Set([
  "dive_site", "snorkel_site", "surf_break", "whale_watching", "cultural", "hiking",
  "fishing_charter", "water_sport", "day_trip", "out_to_island", "market_tour",
  "village_immersion", "cooking_class", "craft_workshop", "film_location",
  "birdwatching", "caving", "cycling", "horse_riding", "fiafia_night",
  "kava_ceremony", "church_visit", "historical_site", "archaeological_site",
  "private_island_hire", "sandbar_excursion", "whale_swim", "sport_fishing",
  "windsurfing", "kitesurfing", "kayaking", "paddleboard", "parasailing",
  "glassbottom_boat", "waterfall", "blue_hole", "volcano_tour",
]);

export const VALID_SKILL_LEVELS = new Set(["beginner", "intermediate", "advanced", "expert", "all_levels", "guided_only"]);
export const VALID_SOURCE_TYPES = new Set(["curated", "provider_self_listed", "hybrid"]);

// Exported so tourismSearchService.ts can build its diving/cultural
// boolean-flag filters from the same source of truth, rather than
// duplicating these lists.
export const DIVE_ACTIVITY_TYPES = ["dive_site", "snorkel_site"];
export const CULTURAL_ACTIVITY_TYPES = [
  "cultural", "fiafia_night", "kava_ceremony", "church_visit", "village_immersion",
  "cooking_class", "craft_workshop", "historical_site", "archaeological_site",
];

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export interface ActivityFilters {
  activityType?: string;
  skillLevel?: string;
  season?: string;
  maxPriceUsd?: number;
  certificationRequired?: boolean;
  accessible?: boolean;
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

export function parseActivityFilters(query: {
  activity_type?: string;
  skill_level?: string;
  season?: string;
  max_price_usd?: string;
  certification_required?: string;
  accessible?: string;
  source_type?: string;
  limit?: string;
  offset?: string;
}): ActivityFilters {
  if (query.activity_type && !VALID_ACTIVITY_TYPES.has(query.activity_type)) {
    throw new ValidationError(`activity_type must be one of: ${Array.from(VALID_ACTIVITY_TYPES).join(", ")}`);
  }
  if (query.skill_level && !VALID_SKILL_LEVELS.has(query.skill_level)) {
    throw new ValidationError(`skill_level must be one of: ${Array.from(VALID_SKILL_LEVELS).join(", ")}`);
  }
  if (query.source_type && !VALID_SOURCE_TYPES.has(query.source_type)) {
    throw new ValidationError(`source_type must be one of: ${Array.from(VALID_SOURCE_TYPES).join(", ")}`);
  }

  const maxPriceUsd = query.max_price_usd !== undefined ? Number(query.max_price_usd) : undefined;
  if (maxPriceUsd !== undefined && (Number.isNaN(maxPriceUsd) || maxPriceUsd < 0)) {
    throw new ValidationError("max_price_usd must be a non-negative number");
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit ?? String(DEFAULT_LIMIT)) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(query.offset ?? "0") || 0);

  return {
    activityType: query.activity_type,
    skillLevel: query.skill_level,
    season: query.season,
    maxPriceUsd,
    certificationRequired: parseBool(query.certification_required),
    accessible: parseBool(query.accessible),
    sourceType: query.source_type,
    limit,
    offset,
  };
}

export async function queryActivities(supabase: SupabaseClient, nationCode: string, filters: ActivityFilters) {
  let query = supabase
    .from("tourism_activities")
    .select("*", { count: "exact" })
    .eq("nation_code", nationCode);

  if (filters.activityType) query = query.eq("activity_type", filters.activityType);
  if (filters.skillLevel) query = query.eq("skill_level", filters.skillLevel);
  if (filters.season) {
    const escaped = filters.season.replace(/[%,]/g, "");
    query = query.or(`season_start.ilike.%${escaped}%,season_end.ilike.%${escaped}%`);
  }
  if (filters.maxPriceUsd !== undefined) query = query.lte("price_max_usd", filters.maxPriceUsd);
  if (filters.certificationRequired !== undefined) query = query.eq("certification_required", filters.certificationRequired);
  if (filters.accessible !== undefined) query = query.eq("accessible_options_available", filters.accessible);
  if (filters.sourceType) query = query.eq("source_type", filters.sourceType);

  query = query.range(filters.offset, filters.offset + filters.limit - 1).order("activity_name", { ascending: true });

  const { data, error, count } = await query;
  if (error) {
    throw new AppError(502, "database_error", `tourism_activities query failed: ${error.message}`);
  }

  // reef_coordinate_lat/lng are plain columns on every row — naturally
  // present (non-null) only for dive_site/snorkel_site rows, per the
  // table's own design. No conditional projection needed.
  return { results: data ?? [], totalCount: count ?? (data ?? []).length };
}

const DIVE_COLUMNS = [
  "id", "tourism_provider_id", "nation_code", "island", "location_name", "activity_name", "description",
  "lat", "lng", "depth_min_m", "depth_max_m", "visibility_min_m", "visibility_max_m",
  "water_temp_min_c", "water_temp_max_c", "current_rating", "certification_required",
  "certification_type", "marine_life_highlights", "coral_health_status",
  "reef_coordinate_lat", "reef_coordinate_lng", "has_marine_hazards", "marine_hazard_types",
  "has_shark_activity", "shark_risk_level", "survivor_connection", "survivor_notes",
  "source_type", "data_confidence",
].join(", ");

export async function queryDiveSites(supabase: SupabaseClient, nationCode: string) {
  const { data, error } = await supabase
    .from("tourism_activities")
    .select(DIVE_COLUMNS)
    .eq("nation_code", nationCode)
    .in("activity_type", DIVE_ACTIVITY_TYPES)
    .order("location_name", { ascending: true });

  if (error) {
    throw new AppError(502, "database_error", `tourism_activities dive query failed: ${error.message}`);
  }

  return data ?? [];
}

export async function queryCulturalActivities(supabase: SupabaseClient, nationCode: string) {
  const { data, error } = await supabase
    .from("tourism_activities")
    .select("*")
    .eq("nation_code", nationCode)
    .in("activity_type", CULTURAL_ACTIVITY_TYPES)
    .order("activity_name", { ascending: true });

  if (error) {
    throw new AppError(502, "database_error", `tourism_activities cultural query failed: ${error.message}`);
  }

  return data ?? [];
}
