import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, NotFoundError } from "../lib/errors.js";

/**
 * Pacific Tourism Data Framework — Phase B. Backs routes/tourism/tourism-weddings.ts.
 * Reads tourism_weddings (one row per nation) plus tourism_accommodations
 * rows flagged is_wedding_venue=true
 * (supabase/migrations/20261026000001_pacific_tourism_schema.sql).
 */

export const LEGAL_DATA_WARNING =
  "Wedding and marriage law data is curated_unverified. Requirements change. Always verify with the relevant national authority or a licensed local legal practitioner before travel. PDC data is for planning reference only.";

const VENUE_COLUMNS = [
  "property_name",
  "property_type",
  "wedding_ceremony_types",
  "wedding_beach_permit_held",
  "wedding_traditional_elements",
  "wedding_honeymoon_packages",
  "wedding_vow_renewal_available",
  "wedding_planner_inhouse",
  "price_luxury_min_usd",
  "price_luxury_max_usd",
  "distance_to_airport_km",
  "data_confidence",
].join(", ");

const MAX_VENUES = 5;

export interface WeddingInfo {
  wedding_requirements: Record<string, unknown> | null;
  wedding_venues: Record<string, unknown>[];
  legal_data_warning: string;
  wedding_data_status?: "not_yet_available";
}

export async function getWeddingInfo(supabase: SupabaseClient, nationCode: string): Promise<WeddingInfo> {
  const { data: destination, error: destError } = await supabase
    .from("tourism_destinations")
    .select("nation_code")
    .eq("nation_code", nationCode)
    .maybeSingle();

  if (destError) {
    throw new AppError(502, "database_error", `tourism_destinations lookup failed: ${destError.message}`);
  }
  if (!destination) {
    throw new NotFoundError(`No tourism_destinations row for nation_code "${nationCode}"`);
  }

  const { data: weddingRow, error: weddingError } = await supabase
    .from("tourism_weddings")
    .select("*")
    .eq("nation_code", nationCode)
    .maybeSingle();

  if (weddingError) {
    throw new AppError(502, "database_error", `tourism_weddings query failed: ${weddingError.message}`);
  }

  if (!weddingRow) {
    // Gap in coverage, not an error — nation_code is valid but this
    // nation has no curated wedding data yet. wedding_venues stays []
    // rather than independently querying tourism_accommodations, per the
    // Phase B build brief's explicit response shape for this case.
    return {
      wedding_requirements: null,
      wedding_venues: [],
      legal_data_warning: LEGAL_DATA_WARNING,
      wedding_data_status: "not_yet_available",
    };
  }

  const { data: venues, error: venuesError } = await supabase
    .from("tourism_accommodations")
    .select(VENUE_COLUMNS)
    .eq("nation_code", nationCode)
    .eq("is_wedding_venue", true)
    .order("star_rating_official", { ascending: false, nullsFirst: false })
    .limit(MAX_VENUES);

  if (venuesError) {
    throw new AppError(502, "database_error", `tourism_accommodations wedding venues query failed: ${venuesError.message}`);
  }

  return {
    wedding_requirements: weddingRow,
    wedding_venues: (venues ?? []) as unknown as Record<string, unknown>[],
    legal_data_warning: LEGAL_DATA_WARNING,
  };
}
