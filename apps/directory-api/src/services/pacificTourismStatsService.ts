import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../lib/errors.js";

/**
 * Pacific Tourism Statistics (Session 34) — the tourism orchestrator's
 * fifth data source, alongside events/FX/fisheries/weather. Unlike those
 * four, this is a direct Supabase read, not an x402-paid sub-endpoint
 * call — World Bank/SPTO arrival and spend figures live in
 * pacific_tourism_stats (see supabase/migrations/session34_pacific_tourism_stats.sql),
 * seeded annually rather than fetched live, so there's no third-party
 * endpoint to pay. Same "public-source data, treated as untrusted input
 * downstream" posture as pacificEventsService.ts.
 */
export interface PacificTourismStats {
  country_code: string;
  country_name: string;
  year: number;
  international_arrivals: number | null;
  tourism_receipts_usd_millions: number | null;
  avg_spend_per_visitor_usd: number | null;
  avg_length_stay_days: number | null;
  peak_months: string[] | null;
  low_months: string[] | null;
  source: string;
  data_quality: string;
}

const SELECT_COLUMNS =
  "country_code, country_name, year, international_arrivals, tourism_receipts_usd_millions, avg_spend_per_visitor_usd, avg_length_stay_days, peak_months, low_months, source, data_quality";

/**
 * Most recent year's stats row for a country. Returns null (never throws)
 * when no row exists for that country — same "absence is a valid result,
 * not an error" posture as getUpcomingEvents' empty array.
 */
export async function getTourismStats(supabase: SupabaseClient, countryCode: string): Promise<PacificTourismStats | null> {
  const { data, error } = await supabase
    .from("pacific_tourism_stats")
    .select(SELECT_COLUMNS)
    .eq("country_code", countryCode)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError(502, "database_error", `Tourism stats query failed: ${error.message}`);
  }

  return (data as unknown as PacificTourismStats) ?? null;
}
