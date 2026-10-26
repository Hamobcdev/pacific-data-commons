import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, ValidationError } from "../lib/errors.js";

/**
 * Pacific Tourism Data Framework — Phase B. Backs routes/tourism/tourism-providers.ts.
 *
 * NOTE: the build brief's FILE 9 section was cut off mid-sentence right
 * after "verification_status (default 'verified')" — no response shape or
 * second route followed. limit/offset/total_count below are completed
 * using the exact same convention as every other list-style route in this
 * brief (tourism-accommodation.ts, tourism-activities.ts,
 * tourism-food-markets.ts), not invented from nothing. Flagged to the user;
 * revisit if more was intended for this file.
 */

export const VALID_PROVIDER_CATEGORIES = new Set([
  "accommodation", "tour_operator", "water_activities", "transport",
  "food_beverage", "conference_events", "local_guide",
]);
export const VALID_VERIFICATION_STATUSES = new Set(["pending", "verified", "rejected", "suspended"]);

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export interface ProviderFilters {
  providerCategory?: string;
  verificationStatus: string;
  limit: number;
  offset: number;
}

export function parseProviderFilters(query: {
  provider_category?: string;
  verification_status?: string;
  limit?: string;
  offset?: string;
}): ProviderFilters {
  if (query.provider_category && !VALID_PROVIDER_CATEGORIES.has(query.provider_category)) {
    throw new ValidationError(`provider_category must be one of: ${Array.from(VALID_PROVIDER_CATEGORIES).join(", ")}`);
  }
  const verificationStatus = query.verification_status ?? "verified";
  if (!VALID_VERIFICATION_STATUSES.has(verificationStatus)) {
    throw new ValidationError(`verification_status must be one of: ${Array.from(VALID_VERIFICATION_STATUSES).join(", ")}`);
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit ?? String(DEFAULT_LIMIT)) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(query.offset ?? "0") || 0);

  return { providerCategory: query.provider_category, verificationStatus, limit, offset };
}

export async function queryProviders(supabase: SupabaseClient, nationCode: string, filters: ProviderFilters) {
  let query = supabase
    .from("tourism_providers")
    .select("*", { count: "exact" })
    .eq("nation_code", nationCode)
    .eq("verification_status", filters.verificationStatus);

  if (filters.providerCategory) query = query.eq("provider_category", filters.providerCategory);

  query = query.range(filters.offset, filters.offset + filters.limit - 1).order("business_name", { ascending: true });

  const { data, error, count } = await query;
  if (error) {
    throw new AppError(502, "database_error", `tourism_providers query failed: ${error.message}`);
  }

  return { results: data ?? [], totalCount: count ?? (data ?? []).length };
}
