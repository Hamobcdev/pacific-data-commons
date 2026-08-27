import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../lib/errors.js";

/**
 * Pacific Events (Session 32) — backs GET /pacific/events and is the first
 * sub-endpoint the Tourism Orchestrator (pacificTourismService.ts) queries.
 * Data is public-source event information (SPTO, tourism authorities,
 * official event sites) — see supabase/migrations/session32_pacific_events.sql's
 * table comment. Treated as untrusted input downstream in the tourism
 * orchestrator's synthesis prompt (Decision 58) — this service only reads
 * and returns it, never executes or interprets it.
 */
export interface PacificEvent {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategory: string | null;
  country_code: string;
  country_name: string;
  city: string | null;
  start_date: string;
  end_date: string;
  expected_attendance: number | null;
  tourism_impact: string | null;
  international_visitors: boolean;
  diaspora_draw: boolean;
  highlights: string[] | null;
  travel_tips: string | null;
  booking_lead_time: string | null;
  source: string;
  data_quality: string;
}

export const VALID_EVENT_CATEGORIES = new Set(["festival", "concert", "sport", "cultural", "religious", "political", "business", "other"]);

const SELECT_COLUMNS =
  "id, name, description, category, subcategory, country_code, country_name, city, start_date, end_date, expected_attendance, tourism_impact, international_visitors, diaspora_draw, highlights, travel_tips, booking_lead_time, source, data_quality";

const MAX_RESULTS = 20;

/**
 * Upcoming Pacific events, filtered by country/category and a forward-
 * looking date window. Returns [] (never throws) when nothing matches —
 * "no events in the window" is a valid, common result, not an error
 * (matches searchEndpoints/getFxRates's "never fail the whole response for
 * an empty result set" posture).
 */
export async function getUpcomingEvents(
  supabase: SupabaseClient,
  params: {
    countryCode?: string;
    daysAhead?: number;
    category?: string;
  } = {},
): Promise<PacificEvent[]> {
  const daysAhead = params.daysAhead ?? 90;
  const today = new Date();
  const windowEnd = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const todayStr = today.toISOString().slice(0, 10);
  const windowEndStr = windowEnd.toISOString().slice(0, 10);

  let query = supabase
    .from("pacific_events")
    .select(SELECT_COLUMNS)
    .eq("is_active", true)
    .gte("start_date", todayStr)
    .lte("start_date", windowEndStr)
    .order("start_date", { ascending: true })
    .limit(MAX_RESULTS);

  if (params.countryCode) {
    query = query.eq("country_code", params.countryCode);
  }
  if (params.category) {
    query = query.eq("category", params.category);
  }

  const { data, error } = await query;
  if (error) {
    throw new AppError(502, "database_error", `Pacific events query failed: ${error.message}`);
  }

  return (data ?? []) as unknown as PacificEvent[];
}
