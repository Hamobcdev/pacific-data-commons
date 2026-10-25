import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, NotFoundError, ValidationError } from "../lib/errors.js";

/**
 * Pacific Tourism Data Framework — Phase B.
 * Backs routes/tourism/tourism-destination.ts. Reads tourism_destinations
 * (supabase/migrations/20261026000001_pacific_tourism_schema.sql) plus
 * LEFT-JOIN counts against tourism_accommodations/tourism_activities/
 * tourism_providers via PostgREST's embedded-resource count syntax
 * (`table(count)`) — a single query per call, not N+1 separate counts.
 */

// Columns excluded from the default /tourism/destinations/pacific listing —
// large TEXT[]/JSONB fields that make the per-row payload heavy and aren't
// needed for a lightweight nation-browse list. ?fields= overrides this.
const LIGHT_DESTINATION_COLUMNS = [
  "nation_code",
  "nation_name",
  "region",
  "capital_city",
  "timezone",
  "currency_code",
  "currency_name",
  "population",
  "land_area_km2",
  "best_season_start",
  "best_season_end",
  "cyclone_risk_rating",
  "casino_legal_status",
  "drone_rules",
  "tap_water_safe",
  "digital_nomad_suitability_rating",
  "source_type",
  "data_confidence",
  "last_verified",
];

// Every real column on tourism_destinations — used to validate a caller-
// supplied ?fields= list so an unknown column name fails with a clear 400
// rather than being silently dropped or causing a raw PostgREST error.
const ALL_DESTINATION_COLUMNS = new Set([
  "id", "nation_code", "nation_name", "region", "island_groups", "capital_city",
  "timezone", "currency_code", "currency_name", "official_languages", "spoken_languages",
  "population", "land_area_km2", "visa_on_arrival", "visa_free", "evisa_available",
  "evisa_url", "visa_notes", "best_season_start", "best_season_end", "wet_season_start",
  "wet_season_end", "cyclone_season_start", "cyclone_season_end", "avg_temp_wet_c",
  "avg_temp_dry_c", "cyclone_risk_rating", "casino_legal_status", "casino_venue_count",
  "casino_regulatory_body", "casino_notes", "survivor_seasons", "notable_productions",
  "film_location_tourism_available", "drone_rules", "drone_permit_authority", "drone_notes",
  "photography_restrictions", "unesco_sites", "nationally_protected_sites",
  "dfat_advisory_level", "dfat_advisory_url", "nz_safetravel_level", "us_state_dept_level",
  "advisory_last_checked", "tap_water_safe", "tap_water_notes", "power_outlet_types",
  "voltage_v", "mobile_coverage_summary", "avg_internet_speed_mbps",
  "digital_nomad_suitability_rating", "source_type", "data_confidence", "data_source",
  "last_verified", "created_at", "updated_at", "nft_destination_token_issued",
  "nft_destination_token_id",
]);

export function parseFieldsParam(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const requested = raw.split(",").map((f) => f.trim()).filter(Boolean);
  if (requested.length === 0) return undefined;
  const invalid = requested.filter((f) => !ALL_DESTINATION_COLUMNS.has(f));
  if (invalid.length > 0) {
    throw new ValidationError(`Unknown field(s) in fields param: ${invalid.join(", ")}`);
  }
  // nation_code always included so list results remain identifiable.
  return Array.from(new Set(["nation_code", ...requested]));
}

export async function getDestinationByNationCode(supabase: SupabaseClient, nationCode: string) {
  const { data, error } = await supabase
    .from("tourism_destinations")
    .select("*, tourism_accommodations(count), tourism_activities(count), tourism_providers(count)")
    .eq("nation_code", nationCode)
    .maybeSingle();

  if (error) {
    throw new AppError(502, "database_error", `tourism_destinations query failed: ${error.message}`);
  }
  if (!data) {
    throw new NotFoundError(`No tourism_destinations row for nation_code "${nationCode}"`);
  }

  type EmbeddedCount = { count: number }[] | null;
  const row = data as Record<string, unknown> & {
    tourism_accommodations: EmbeddedCount;
    tourism_activities: EmbeddedCount;
    tourism_providers: EmbeddedCount;
  };

  const { tourism_accommodations, tourism_activities, tourism_providers, ...destination } = row;

  return {
    ...destination,
    counts: {
      accommodations: tourism_accommodations?.[0]?.count ?? 0,
      activities: tourism_activities?.[0]?.count ?? 0,
      providers: tourism_providers?.[0]?.count ?? 0,
    },
  };
}

export async function getPacificDestinations(
  supabase: SupabaseClient,
  params: { region?: string; fields?: string[] },
) {
  const region = params.region ?? "pacific_island";
  const columns = (params.fields ?? LIGHT_DESTINATION_COLUMNS).join(", ");

  const { data, error } = await supabase
    .from("tourism_destinations")
    .select(columns)
    .eq("region", region)
    .order("nation_name", { ascending: true });

  if (error) {
    throw new AppError(502, "database_error", `tourism_destinations list query failed: ${error.message}`);
  }

  return data ?? [];
}

const PROFILE_COLUMNS =
  "nation_code, nation_name, capital_city, currency_code, timezone, best_season_start, best_season_end, cyclone_risk_rating, tap_water_safe, data_confidence";

export async function getDestinationProfile(supabase: SupabaseClient, nationCode: string) {
  const { data, error } = await supabase
    .from("tourism_destinations")
    .select(PROFILE_COLUMNS)
    .eq("nation_code", nationCode)
    .maybeSingle();

  if (error) {
    throw new AppError(502, "database_error", `tourism_destinations profile query failed: ${error.message}`);
  }
  if (!data) {
    throw new NotFoundError(`No tourism_destinations row for nation_code "${nationCode}"`);
  }

  return data;
}

const ADVISORY_COLUMNS =
  "dfat_advisory_level, dfat_advisory_url, nz_safetravel_level, us_state_dept_level, advisory_last_checked, data_confidence";

export async function getDestinationAdvisories(supabase: SupabaseClient, nationCode: string) {
  const { data, error } = await supabase
    .from("tourism_destinations")
    .select(ADVISORY_COLUMNS)
    .eq("nation_code", nationCode)
    .maybeSingle();

  if (error) {
    throw new AppError(502, "database_error", `tourism_destinations advisories query failed: ${error.message}`);
  }
  if (!data) {
    throw new NotFoundError(`No tourism_destinations row for nation_code "${nationCode}"`);
  }

  return {
    ...data,
    advisory_data_warning:
      "Travel advisory levels are manually refreshed. Always verify against official sources before travel.",
  };
}
