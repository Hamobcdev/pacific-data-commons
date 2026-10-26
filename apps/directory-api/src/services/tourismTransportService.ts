import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, ValidationError } from "../lib/errors.js";

/** Pacific Tourism Data Framework — Phase B. Backs routes/tourism/tourism-transport.ts. */

export const VALID_TRANSPORT_TYPES = new Set([
  "ferry", "domestic_airline", "inter_island_transfer", "airport_transfer",
  "car_hire", "boat_charter", "water_taxi", "helicopter", "seaplane",
]);
export const VALID_FREQUENCIES = new Set([
  "multiple_daily", "daily", "several_weekly", "weekly", "fortnightly", "monthly", "seasonal", "on_demand",
]);

function escapeForOrFilter(value: string): string {
  return value.replace(/[%,]/g, "");
}

export async function queryTransport(
  supabase: SupabaseClient,
  nationCode: string,
  params: { transportType?: string; frequency?: string },
) {
  if (params.transportType && !VALID_TRANSPORT_TYPES.has(params.transportType)) {
    throw new ValidationError(`transport_type must be one of: ${Array.from(VALID_TRANSPORT_TYPES).join(", ")}`);
  }
  if (params.frequency && !VALID_FREQUENCIES.has(params.frequency)) {
    throw new ValidationError(`frequency must be one of: ${Array.from(VALID_FREQUENCIES).join(", ")}`);
  }

  let query = supabase.from("tourism_transport").select("*").eq("nation_code", nationCode);
  if (params.transportType) query = query.eq("transport_type", params.transportType);
  if (params.frequency) query = query.eq("frequency", params.frequency);

  const { data, error } = await query
    .order("transport_type", { ascending: true })
    .order("operator_name", { ascending: true });

  if (error) {
    throw new AppError(502, "database_error", `tourism_transport query failed: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Matches a record if EITHER origin OR destination matches ANY of the
 * four location columns (origin, destination, origin_nation_code,
 * destination_nation_code) — a "does this route touch either point"
 * lookup, not a strict directional origin->destination match.
 */
export async function queryTransportRoutes(supabase: SupabaseClient, params: { origin?: string; destination?: string }) {
  if (!params.origin) throw new ValidationError("origin is required");
  if (!params.destination) throw new ValidationError("destination is required");

  const origin = escapeForOrFilter(params.origin);
  const destination = escapeForOrFilter(params.destination);
  const columns = ["origin", "destination", "origin_nation_code", "destination_nation_code"];
  const clauses = columns.flatMap((col) => [`${col}.ilike.%${origin}%`, `${col}.ilike.%${destination}%`]);

  const { data, error } = await supabase
    .from("tourism_transport")
    .select("*")
    .or(clauses.join(","))
    .order("nation_code", { ascending: true });

  if (error) {
    throw new AppError(502, "database_error", `tourism_transport routes query failed: ${error.message}`);
  }

  return data ?? [];
}
