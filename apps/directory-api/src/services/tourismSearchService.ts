import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, ValidationError } from "../lib/errors.js";
import { VALID_ACTIVITY_TYPES, DIVE_ACTIVITY_TYPES, CULTURAL_ACTIVITY_TYPES } from "./tourismActivitiesService.js";

/**
 * Pacific Tourism Data Framework — Phase B. Backs routes/tourism/tourism-search.ts.
 * Cross-table search: destination filter first (produces the candidate
 * nation_code set), then accommodation/activity queries scoped to that set,
 * then a capped hazard summary per matched nation — per the build brief's
 * own stated algorithm. Hard caps: 10 nations, 50 records per sub-array.
 */

const MAX_NATIONS = 10;
const MAX_RECORDS_PER_ARRAY = 50;
const MAX_HAZARDS_PER_NATION = 3;
const HAZARD_RISK_LEVELS = ["critical", "high"];

export const VALID_SOURCE_TYPE_FILTERS = new Set(["curated", "provider_self_listed", "all"]);

export interface SearchFilters {
  nationCode?: string;
  region: string;
  activityType?: string;
  season?: string;
  maxBudgetPerDayUsd?: number;
  groupSize?: number;
  hasCasino?: boolean;
  hasConference?: boolean;
  hasWeddingVenue?: boolean;
  diving?: boolean;
  surfing?: boolean;
  whaleWatching?: boolean;
  cultural?: boolean;
  dietary?: string;
  accessibilityRequired?: boolean;
  sourceType: "curated" | "provider_self_listed" | "all";
}

function parseBool(raw: string | undefined, paramName: string): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ValidationError(`${paramName} must be "true" or "false", got "${raw}"`);
}

export function parseSearchFilters(searchParams: URLSearchParams): SearchFilters {
  if (searchParams.size === 0) {
    throw new ValidationError("At least one query parameter is required for /tourism/search");
  }

  const activityType = searchParams.get("activity_type") ?? undefined;
  if (activityType && !VALID_ACTIVITY_TYPES.has(activityType)) {
    throw new ValidationError(`activity_type must be one of: ${Array.from(VALID_ACTIVITY_TYPES).join(", ")}`);
  }

  const sourceType = (searchParams.get("source_type") ?? "all") as SearchFilters["sourceType"];
  if (!VALID_SOURCE_TYPE_FILTERS.has(sourceType)) {
    throw new ValidationError(`source_type must be one of: ${Array.from(VALID_SOURCE_TYPE_FILTERS).join(", ")}`);
  }

  const maxBudgetRaw = searchParams.get("max_budget_per_day_usd");
  const maxBudgetPerDayUsd = maxBudgetRaw !== null ? Number(maxBudgetRaw) : undefined;
  if (maxBudgetPerDayUsd !== undefined && (Number.isNaN(maxBudgetPerDayUsd) || maxBudgetPerDayUsd < 0)) {
    throw new ValidationError("max_budget_per_day_usd must be a non-negative number");
  }

  const groupSizeRaw = searchParams.get("group_size");
  const groupSize = groupSizeRaw !== null ? Number(groupSizeRaw) : undefined;
  if (groupSize !== undefined && (!Number.isInteger(groupSize) || groupSize < 1)) {
    throw new ValidationError("group_size must be a positive integer");
  }

  return {
    nationCode: searchParams.get("nation_code") ?? undefined,
    region: searchParams.get("region") ?? "pacific_island",
    activityType,
    season: searchParams.get("season") ?? undefined,
    maxBudgetPerDayUsd,
    groupSize,
    hasCasino: parseBool(searchParams.get("has_casino") ?? undefined, "has_casino"),
    hasConference: parseBool(searchParams.get("has_conference") ?? undefined, "has_conference"),
    hasWeddingVenue: parseBool(searchParams.get("has_wedding_venue") ?? undefined, "has_wedding_venue"),
    diving: parseBool(searchParams.get("diving") ?? undefined, "diving"),
    surfing: parseBool(searchParams.get("surfing") ?? undefined, "surfing"),
    whaleWatching: parseBool(searchParams.get("whale_watching") ?? undefined, "whale_watching"),
    cultural: parseBool(searchParams.get("cultural") ?? undefined, "cultural"),
    dietary: searchParams.get("dietary") ?? undefined,
    accessibilityRequired: parseBool(searchParams.get("accessibility_required") ?? undefined, "accessibility_required"),
    sourceType,
  };
}

function buildActivityTypeSet(filters: SearchFilters): string[] {
  const types = new Set<string>();
  if (filters.activityType) types.add(filters.activityType);
  if (filters.diving) DIVE_ACTIVITY_TYPES.forEach((t) => types.add(t));
  if (filters.surfing) types.add("surf_break");
  if (filters.whaleWatching) {
    types.add("whale_watching");
    types.add("whale_swim");
  }
  if (filters.cultural) CULTURAL_ACTIVITY_TYPES.forEach((t) => types.add(t));
  return Array.from(types);
}

function tallyField<T extends Record<string, unknown>>(rows: T[], field: string, counts: Record<string, number>): void {
  for (const row of rows) {
    const value = row[field];
    if (typeof value === "string" && value in counts) {
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }
}

export async function searchTourism(supabase: SupabaseClient, filters: SearchFilters) {
  // Step 1 — destination filter determines the candidate nation_code set.
  let destQuery = supabase
    .from("tourism_destinations")
    .select("*")
    .eq("region", filters.region)
    .order("nation_name", { ascending: true })
    .limit(MAX_NATIONS);

  if (filters.nationCode) destQuery = destQuery.eq("nation_code", filters.nationCode);

  const { data: destinations, error: destError } = await destQuery;
  if (destError) {
    throw new AppError(502, "database_error", `tourism_destinations search query failed: ${destError.message}`);
  }

  const nationCodes = (destinations ?? []).map((d) => d.nation_code as string);

  if (nationCodes.length === 0) {
    return {
      nations_matched: [],
      results: { destinations: [], accommodations: [], activities: [], hazard_summary: [] },
      data_confidence_summary: { verified: 0, curated_unverified: 0, provider_self_declared: 0 },
      source_type_summary: { curated: 0, provider_self_listed: 0, hybrid: 0 },
    };
  }

  // Step 2a — accommodations, scoped to the matched nations.
  let accomQuery = supabase
    .from("tourism_accommodations")
    .select("*")
    .in("nation_code", nationCodes)
    .limit(MAX_RECORDS_PER_ARRAY);

  if (filters.hasCasino !== undefined) accomQuery = accomQuery.eq("has_casino", filters.hasCasino);
  if (filters.hasConference !== undefined) accomQuery = accomQuery.eq("has_conference_facilities", filters.hasConference);
  if (filters.hasWeddingVenue !== undefined) accomQuery = accomQuery.eq("is_wedding_venue", filters.hasWeddingVenue);
  if (filters.maxBudgetPerDayUsd !== undefined) accomQuery = accomQuery.lte("price_midrange_max_usd", filters.maxBudgetPerDayUsd);
  if (filters.accessibilityRequired !== undefined) accomQuery = accomQuery.eq("has_accessible_rooms", filters.accessibilityRequired);
  if (filters.sourceType !== "all") accomQuery = accomQuery.eq("source_type", filters.sourceType);

  // Step 2b — activities, scoped to the matched nations.
  let activityQuery = supabase
    .from("tourism_activities")
    .select("*")
    .in("nation_code", nationCodes)
    .limit(MAX_RECORDS_PER_ARRAY);

  const activityTypes = buildActivityTypeSet(filters);
  if (activityTypes.length > 0) activityQuery = activityQuery.in("activity_type", activityTypes);
  if (filters.season) {
    const escaped = filters.season.replace(/[%,]/g, "");
    activityQuery = activityQuery.or(`season_start.ilike.%${escaped}%,season_end.ilike.%${escaped}%`);
  }
  if (filters.groupSize !== undefined) activityQuery = activityQuery.gte("maximum_group_size", filters.groupSize);
  if (filters.accessibilityRequired !== undefined) {
    activityQuery = activityQuery.eq("accessible_options_available", filters.accessibilityRequired);
  }
  if (filters.sourceType !== "all") activityQuery = activityQuery.eq("source_type", filters.sourceType);

  // dietary has no column on tourism_accommodations or tourism_activities
  // (dietary_options lives on tourism_food_beverage, which this response
  // shape does not include) — accepted and echoed in the query block, but
  // not applied to any filter here.

  const [accomResult, activityResult] = await Promise.all([accomQuery, activityQuery]);

  if (accomResult.error) {
    throw new AppError(502, "database_error", `tourism_accommodations search query failed: ${accomResult.error.message}`);
  }
  if (activityResult.error) {
    throw new AppError(502, "database_error", `tourism_activities search query failed: ${activityResult.error.message}`);
  }

  const accommodations = accomResult.data ?? [];
  const activities = activityResult.data ?? [];

  // Hazard summary — critical/high only, capped at 3 per matched nation.
  const { data: hazardRows, error: hazardError } = await supabase
    .from("tourism_hazards")
    .select("*")
    .in("nation_code", nationCodes)
    .in("risk_level", HAZARD_RISK_LEVELS);

  if (hazardError) {
    throw new AppError(502, "database_error", `tourism_hazards search query failed: ${hazardError.message}`);
  }

  const hazardsByNation = new Map<string, Record<string, unknown>[]>();
  for (const hazard of hazardRows ?? []) {
    const list = hazardsByNation.get(hazard.nation_code) ?? [];
    if (list.length < MAX_HAZARDS_PER_NATION) list.push(hazard);
    hazardsByNation.set(hazard.nation_code, list);
  }
  const hazardSummary = nationCodes.flatMap((code) => hazardsByNation.get(code) ?? []);

  // data_confidence_summary tallies across destinations + accommodations +
  // activities + hazards (hazards carry data_confidence but no source_type).
  // source_type_summary tallies across destinations + accommodations +
  // activities only (hazards have no source_type column).
  const dataConfidenceSummary = { verified: 0, curated_unverified: 0, provider_self_declared: 0 };
  const sourceTypeSummary = { curated: 0, provider_self_listed: 0, hybrid: 0 };

  for (const rows of [destinations ?? [], accommodations, activities]) {
    tallyField(rows, "data_confidence", dataConfidenceSummary);
    tallyField(rows, "source_type", sourceTypeSummary);
  }
  tallyField(hazardSummary, "data_confidence", dataConfidenceSummary);

  return {
    nations_matched: nationCodes,
    results: {
      destinations: destinations ?? [],
      accommodations,
      activities,
      hazard_summary: hazardSummary,
    },
    data_confidence_summary: dataConfidenceSummary,
    source_type_summary: sourceTypeSummary,
  };
}
