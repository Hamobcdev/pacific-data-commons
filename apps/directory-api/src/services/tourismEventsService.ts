import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, ValidationError } from "../lib/errors.js";

/**
 * Pacific Tourism Data Framework — Phase B. Backs routes/tourism/tourism-events.ts.
 * Reads pacific_events, extended in Phase A
 * (supabase/migrations/20261026000001_pacific_tourism_schema.sql) with
 * event_category/is_tourist_friendly/ticket_price_min/ticket_price_max/
 * booking_url/data_confidence/data_source/last_verified — the earlier Session 32
 * category/subcategory columns remain, unrelated to the new
 * event_category taxonomy.
 */

export const VALID_EVENT_CATEGORIES = new Set([
  "cultural_festival", "sporting", "business_conference", "religious",
  "christmas_new_year", "independence_day", "agricultural_show",
  "music_festival", "food_festival",
]);

const SELECT_COLUMNS =
  "id, name, slug, description, country_code, country_name, city, venue, start_date, end_date, is_annual, event_category, is_tourist_friendly, ticket_price_min, ticket_price_max, ticket_currency, booking_url, data_confidence";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateIsoDate(value: string, paramName: string): void {
  if (!ISO_DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${paramName} must be an ISO date (YYYY-MM-DD)`);
  }
}

export interface EventFilters {
  eventCategory?: string;
  fromDate?: string;
  toDate?: string;
  isTouristFriendly: boolean;
}

export function parseEventFilters(query: {
  event_category?: string;
  from_date?: string;
  to_date?: string;
  is_tourist_friendly?: string;
}): EventFilters {
  if (query.event_category && !VALID_EVENT_CATEGORIES.has(query.event_category)) {
    throw new ValidationError(`event_category must be one of: ${Array.from(VALID_EVENT_CATEGORIES).join(", ")}`);
  }
  if (query.from_date) validateIsoDate(query.from_date, "from_date");
  if (query.to_date) validateIsoDate(query.to_date, "to_date");

  let isTouristFriendly = true;
  if (query.is_tourist_friendly !== undefined) {
    if (query.is_tourist_friendly === "true") isTouristFriendly = true;
    else if (query.is_tourist_friendly === "false") isTouristFriendly = false;
    else throw new ValidationError(`is_tourist_friendly must be "true" or "false", got "${query.is_tourist_friendly}"`);
  }

  return {
    eventCategory: query.event_category,
    fromDate: query.from_date,
    toDate: query.to_date,
    isTouristFriendly,
  };
}

export async function queryTourismEvents(supabase: SupabaseClient, nationCode: string, filters: EventFilters) {
  let query = supabase
    .from("pacific_events")
    .select(SELECT_COLUMNS)
    .eq("country_code", nationCode)
    .eq("is_tourist_friendly", filters.isTouristFriendly);

  if (filters.eventCategory) query = query.eq("event_category", filters.eventCategory);
  if (filters.fromDate) query = query.gte("start_date", filters.fromDate);
  if (filters.toDate) query = query.lte("start_date", filters.toDate);

  const { data, error } = await query.order("start_date", { ascending: true });
  if (error) {
    throw new AppError(502, "database_error", `pacific_events query failed: ${error.message}`);
  }

  return data ?? [];
}

interface ChristmasEventRow {
  country_code: string;
  country_name: string;
  start_date: string;
  event_category: string | null;
  [key: string]: unknown;
}

function isInChristmasWindow(startDate: string): boolean {
  // Dec 15 through Jan 5, evaluated on month/day regardless of calendar
  // year — a recurring seasonal window, not a fixed-year date range.
  const month = Number(startDate.slice(5, 7));
  const day = Number(startDate.slice(8, 10));
  return (month === 12 && day >= 15) || (month === 1 && day <= 5);
}

export async function queryChristmasEvents(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("pacific_events").select(SELECT_COLUMNS);
  if (error) {
    throw new AppError(502, "database_error", `pacific_events christmas query failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as ChristmasEventRow[];
  const matched = rows.filter((row) => row.event_category === "christmas_new_year" || isInChristmasWindow(row.start_date));

  const groups = new Map<string, { nation_code: string; nation_name: string; events: ChristmasEventRow[] }>();
  for (const row of matched) {
    const existing = groups.get(row.country_code);
    if (existing) {
      existing.events.push(row);
    } else {
      groups.set(row.country_code, { nation_code: row.country_code, nation_name: row.country_name, events: [row] });
    }
  }

  for (const group of groups.values()) {
    group.events.sort((a, b) => a.start_date.localeCompare(b.start_date));
  }

  return Array.from(groups.values()).sort((a, b) => a.nation_code.localeCompare(b.nation_code));
}
