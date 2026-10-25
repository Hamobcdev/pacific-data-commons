import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, NotFoundError, ValidationError } from "../lib/errors.js";

/** Pacific Tourism Data Framework — Phase B. Backs routes/tourism/tourism-safety.ts. */

export const VALID_HAZARD_TYPES = new Set([
  "riptide", "jellyfish", "box_jellyfish", "shark", "stonefish", "cone_snail",
  "crocodile", "crown_of_thorns", "strong_current", "cyclone", "tsunami",
  "flood", "volcanic", "earthquake", "dengue", "malaria", "zika",
  "uv_extreme", "unsafe_water", "mosquito", "sea_urchin", "coral_cuts", "sunburn",
]);
export const VALID_RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);
export const VALID_FACILITY_TYPES = new Set([
  "hospital_surgical", "clinic_basic", "pharmacy", "decompression_chamber",
  "dental", "evacuation_service", "blood_bank", "health_centre",
]);

export const SAFETY_DATA_WARNING =
  "Hazard data is curated_unverified unless explicitly marked verified. Always confirm safety conditions with local authorities before activity. Data may not reflect current conditions.";

const RISK_LEVEL_SORT_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function parseBool(raw: string | undefined, paramName: string): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ValidationError(`${paramName} must be "true" or "false", got "${raw}"`);
}

export async function queryHazards(
  supabase: SupabaseClient,
  nationCode: string,
  params: { hazardType?: string; riskLevel?: string; island?: string },
) {
  if (params.hazardType && !VALID_HAZARD_TYPES.has(params.hazardType)) {
    throw new ValidationError(`hazard_type must be one of: ${Array.from(VALID_HAZARD_TYPES).join(", ")}`);
  }
  if (params.riskLevel && !VALID_RISK_LEVELS.has(params.riskLevel)) {
    throw new ValidationError(`risk_level must be one of: ${Array.from(VALID_RISK_LEVELS).join(", ")}`);
  }

  let query = supabase.from("tourism_hazards").select("*").eq("nation_code", nationCode);
  if (params.hazardType) query = query.eq("hazard_type", params.hazardType);
  if (params.riskLevel) query = query.eq("risk_level", params.riskLevel);
  if (params.island) query = query.ilike("island", `%${params.island}%`);

  const { data, error } = await query;
  if (error) {
    throw new AppError(502, "database_error", `tourism_hazards query failed: ${error.message}`);
  }

  // risk_level is text, not an ordered type — critical-first ordering is
  // applied in application code rather than a DB-side CASE expression
  // (per-nation row counts are small; no RPC needed for this).
  const results = [...(data ?? [])].sort(
    (a, b) => (RISK_LEVEL_SORT_RANK[a.risk_level] ?? 99) - (RISK_LEVEL_SORT_RANK[b.risk_level] ?? 99),
  );

  return results;
}

export async function queryHealthInfrastructure(
  supabase: SupabaseClient,
  nationCode: string,
  params: { facilityType?: string; hasSurgicalCapacity?: string; hasEvacuationCapability?: string },
) {
  if (params.facilityType && !VALID_FACILITY_TYPES.has(params.facilityType)) {
    throw new ValidationError(`facility_type must be one of: ${Array.from(VALID_FACILITY_TYPES).join(", ")}`);
  }
  const hasSurgicalCapacity = parseBool(params.hasSurgicalCapacity, "has_surgical_capacity");
  const hasEvacuationCapability = parseBool(params.hasEvacuationCapability, "has_evacuation_capability");

  let query = supabase.from("tourism_health_infrastructure").select("*").eq("nation_code", nationCode);
  if (params.facilityType) query = query.eq("facility_type", params.facilityType);
  if (hasSurgicalCapacity !== undefined) query = query.eq("has_surgical_capacity", hasSurgicalCapacity);
  if (hasEvacuationCapability !== undefined) query = query.eq("has_evacuation_capability", hasEvacuationCapability);

  const { data, error } = await query.order("facility_name", { ascending: true });
  if (error) {
    throw new AppError(502, "database_error", `tourism_health_infrastructure query failed: ${error.message}`);
  }

  return data ?? [];
}

const PROTOCOLS_COLUMNS = "*";

export async function getCulturalProtocols(supabase: SupabaseClient, nationCode: string) {
  const { data, error } = await supabase
    .from("tourism_cultural_protocols")
    .select(PROTOCOLS_COLUMNS)
    .eq("nation_code", nationCode)
    .maybeSingle();

  if (error) {
    throw new AppError(502, "database_error", `tourism_cultural_protocols query failed: ${error.message}`);
  }
  if (!data) {
    throw new NotFoundError(`No tourism_cultural_protocols row for nation_code "${nationCode}" yet`);
  }

  return data;
}
