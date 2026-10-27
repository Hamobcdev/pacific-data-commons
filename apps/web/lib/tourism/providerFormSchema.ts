import { z } from "zod";
import { isValidAddressFormat } from "@/lib/algorand/validate";
import { ACTIVITY_TYPE_VALUES, CERTIFICATION_TYPE_VALUES, PRICE_PER_VALUES } from "./activityTypes";
import { MARKET_TYPE_VALUES, OPERATING_DAY_VALUES, BOOKING_METHOD_VALUES } from "./marketVendorTypes";

/**
 * Every field name and CHECK vocabulary below was verified against
 * supabase/migrations/20261026000001_pacific_tourism_schema.sql (Phase A)
 * and 20261026000002-4 (Phase C) directly — not against Phase C's original
 * brief, whose field list diverged from the live schema in most categories
 * (wrong vocab, missing NOT NULL fields, multi-select where the column is
 * scalar, etc.). This file is the corrected, approved mapping. See the
 * Phase C approval thread for the full audit.
 */

export const PROVIDER_CATEGORY_VALUES = [
  "accommodation",
  "tour_operator",
  "water_activities",
  "transport",
  "food_beverage",
  "conference_events",
  "local_guide",
  "market_vendor",
] as const;

export type ProviderCategory = (typeof PROVIDER_CATEGORY_VALUES)[number];

// The 13 nations seeded into tourism_destinations (Phase A migration's
// INSERT INTO tourism_destinations block) — confirmed against that file.
export const NATION_CODE_VALUES = ["WS", "TO", "FJ", "VU", "CK", "NU", "PW", "PF", "SB", "MH", "FM", "KI", "PG"] as const;

export type NationCode = (typeof NATION_CODE_VALUES)[number];

const optionalTrimmed = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

const optionalUrl = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine((v) => v === undefined || /^https?:\/\//.test(v), "Must be a valid URL starting with http:// or https://");

const optionalNonNegativeNumber = () => z.coerce.number().nonnegative().optional();
const optionalPositiveInt = () => z.coerce.number().int().positive().optional();
const optionalNonNegativeInt = () => z.coerce.number().int().nonnegative().optional();

/** tourism_providers columns — the base fields present on every category. */
export const BaseProviderSchema = z.object({
  business_name: z.string().trim().min(2, "Business name must be at least 2 characters").max(200),
  contact_email: z.string().trim().email("A valid contact email is required"),
  contact_phone: optionalTrimmed(),
  website_url: optionalUrl(),
  nation_code: z.enum(NATION_CODE_VALUES, { required_error: "Please select a nation" }),
  // Renamed from the brief's "region_district"/"address_physical" — no such
  // columns exist on tourism_providers; these are the real column names.
  town_or_area: optionalTrimmed(),
  street_address: optionalTrimmed(),
  // "for future x402 endpoint payments" — tourism_providers.wallet_address
  // (added by migration 20261026000004; distinct from the unrelated
  // tiptide_wallet_address loyalty-wallet feature).
  wallet_address: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine((v) => v === undefined || isValidAddressFormat(v), "This does not look like a valid Algorand address"),
  // The brief's single free-text "local resident rate" field doesn't exist —
  // the real columns are a boolean + a notes field.
  local_resident_rate_available: z.boolean().default(false),
  local_resident_rate_notes: optionalTrimmed(),
  // feature/provider-urls — added by migration 20261028000001. Deliberately
  // the exact validators specified for this change rather than this file's
  // own optionalUrl()/optionalTrimmed() helpers (no http(s)-only restriction,
  // '' accepted alongside a valid URL). pdc_referral_tag is NOT here — it's
  // server-generated (registerProvider.ts), never a user input field.
  booking_url: z.string().url().optional().or(z.literal("")),
  payment_url: z.string().url().optional().or(z.literal("")),
  booking_platform: z.string().max(100).optional(),
  facebook_url: z.string().url().optional().or(z.literal("")),
  instagram_url: z.string().url().optional().or(z.literal("")),
  whatsapp_number: z.string().max(20).optional(),
});
export type BaseProviderFields = z.infer<typeof BaseProviderSchema>;

/** tourism_accommodations. */
export const PROPERTY_TYPE_VALUES = [
  "hotel",
  "resort",
  "guesthouse",
  "beach_fale",
  "homestay",
  "overwater_bungalow",
  "villa",
  "backpacker_hostel",
  "boutique_hotel",
  "eco_lodge",
  "motel",
] as const;

export const AccommodationSchema = z.object({
  property_name: z.string().trim().min(2, "Property name is required"),
  property_type: z.enum(PROPERTY_TYPE_VALUES, { required_error: "Please select a property type" }),
  room_count_total: optionalNonNegativeInt(),
  room_count_standard: optionalNonNegativeInt(),
  room_count_deluxe: optionalNonNegativeInt(),
  room_count_suite: optionalNonNegativeInt(),
  room_count_overwater: optionalNonNegativeInt(),
  room_count_fale_bure: optionalNonNegativeInt(),
  room_count_villa: optionalNonNegativeInt(),
  room_count_accessible: optionalNonNegativeInt(),
  has_restaurant: z.boolean().default(false),
  has_pool: z.boolean().default(false),
  price_budget_min_usd: optionalNonNegativeNumber(),
  price_budget_max_usd: optionalNonNegativeNumber(),
  price_midrange_min_usd: optionalNonNegativeNumber(),
  price_midrange_max_usd: optionalNonNegativeNumber(),
  price_luxury_min_usd: optionalNonNegativeNumber(),
  price_luxury_max_usd: optionalNonNegativeNumber(),
});

/** tourism_activities — covers water_activities, tour_operator, local_guide. */
export const ActivitiesSchema = z.object({
  location_name: z.string().trim().min(2, "Location name is required"),
  activity_name: z.string().trim().min(2, "Activity name is required"),
  activity_type: z.enum(ACTIVITY_TYPE_VALUES, { required_error: "Please select an activity type" }),
  certification_required: z.boolean().default(false),
  certification_type: z.array(z.enum(CERTIFICATION_TYPE_VALUES)).default([]),
  minimum_group_size: optionalPositiveInt(),
  maximum_group_size: optionalPositiveInt(),
  price_min_usd: optionalNonNegativeNumber(),
  price_max_usd: optionalNonNegativeNumber(),
  price_per: z.enum(PRICE_PER_VALUES).optional(),
});

/** tourism_transport. */
export const TRANSPORT_TYPE_VALUES = [
  "ferry",
  "domestic_airline",
  "inter_island_transfer",
  "airport_transfer",
  "car_hire",
  "boat_charter",
  "water_taxi",
  "helicopter",
  "seaplane",
] as const;

export const FREQUENCY_VALUES = [
  "multiple_daily",
  "daily",
  "several_weekly",
  "weekly",
  "fortnightly",
  "monthly",
  "seasonal",
  "on_demand",
] as const;

export const TransportSchema = z.object({
  transport_type: z.enum(TRANSPORT_TYPE_VALUES, { required_error: "Please select a transport type" }),
  // NOT NULL on tourism_transport, no corresponding brief field.
  operator_name: z.string().trim().min(2, "Operator name is required"),
  // Renamed from the brief's optional route_from/route_to — origin and
  // destination are NOT NULL on tourism_transport.
  origin: z.string().trim().min(1, "Origin is required"),
  destination: z.string().trim().min(1, "Destination is required"),
  frequency: z.enum(FREQUENCY_VALUES).optional(),
  schedule_notes: optionalTrimmed(),
  passenger_capacity: optionalPositiveInt(),
  price_min_usd: optionalNonNegativeNumber(),
  price_max_usd: optionalNonNegativeNumber(),
  booking_method: z.array(z.enum(BOOKING_METHOD_VALUES)).default([]),
});

/** tourism_food_beverage. */
export const VENUE_TYPE_FOOD_BEVERAGE_VALUES = [
  "restaurant",
  "bar",
  "cafe",
  "market_stall",
  "food_tour",
  "catering_service",
  "kava_bar",
  "night_market",
  "food_truck",
  "hotel_restaurant",
  "beach_bar",
] as const;

const DayHoursSchema = z.object({
  open: z.string().trim().nullable().optional(),
  close: z.string().trim().nullable().optional(),
  closed: z.boolean().default(false),
});

const OperatingHoursSchema = z.object({
  monday: DayHoursSchema.optional(),
  tuesday: DayHoursSchema.optional(),
  wednesday: DayHoursSchema.optional(),
  thursday: DayHoursSchema.optional(),
  friday: DayHoursSchema.optional(),
  saturday: DayHoursSchema.optional(),
  sunday: DayHoursSchema.optional(),
});

export const FoodBeverageSchema = z.object({
  venue_name: z.string().trim().min(2, "Venue name is required"),
  venue_type: z.enum(VENUE_TYPE_FOOD_BEVERAGE_VALUES, { required_error: "Please select a venue type" }),
  // Free text — server action wraps a non-empty value into a one-element
  // array for the real cuisine_types TEXT[] column. No comma-splitting.
  cuisine_type: optionalTrimmed(),
  alcohol_licence: z.boolean().default(false),
  price_per_person_min_usd: optionalNonNegativeNumber(),
  price_per_person_max_usd: optionalNonNegativeNumber(),
  operating_hours: OperatingHoursSchema.partial().optional(),
  reservations_required: z.boolean().default(false),
});

/** tourism_conference_venues. */
export const VENUE_TYPE_CONFERENCE_VALUES = [
  "dedicated_conference_centre",
  "community_venue",
  "church_hall",
  "outdoor_event_space",
  "government_venue",
  "university_venue",
  "sports_venue",
] as const;

export const AV_STANDARD_VALUES = ["none", "basic", "standard", "full_av", "broadcast"] as const;

export const ConferenceEventsSchema = z.object({
  venue_name: z.string().trim().min(2, "Venue name is required"),
  venue_type: z.enum(VENUE_TYPE_CONFERENCE_VALUES, { required_error: "Please select a venue type" }),
  capacity_theatre: optionalNonNegativeInt(),
  capacity_classroom: optionalNonNegativeInt(),
  capacity_banquet: optionalNonNegativeInt(),
  av_standard: z.enum(AV_STANDARD_VALUES).optional(),
  inhouse_catering: z.boolean().default(false),
  // Remapped from the brief's has_accommodation boolean — the real column
  // is a free-text description of nearby accommodation, not a boolean.
  accommodation_nearby: optionalTrimmed(),
  price_half_day_usd: optionalNonNegativeNumber(),
  price_full_day_usd: optionalNonNegativeNumber(),
});

/** tourism_markets. */
export const MarketVendorSchema = z.object({
  market_name: z.string().trim().min(2, "Market name is required"),
  market_type: z.enum(MARKET_TYPE_VALUES, { required_error: "Please select a market type" }),
  town: optionalTrimmed(),
  operating_days: z.array(z.enum(OPERATING_DAY_VALUES)).default([]),
  opening_time: optionalTrimmed(),
  closing_time: optionalTrimmed(),
});

export const ProviderFormSchema = z.discriminatedUnion("provider_category", [
  BaseProviderSchema.extend({ provider_category: z.literal("accommodation") }).merge(AccommodationSchema),
  BaseProviderSchema.extend({ provider_category: z.literal("tour_operator") }).merge(ActivitiesSchema),
  BaseProviderSchema.extend({ provider_category: z.literal("water_activities") }).merge(ActivitiesSchema),
  BaseProviderSchema.extend({ provider_category: z.literal("transport") }).merge(TransportSchema),
  BaseProviderSchema.extend({ provider_category: z.literal("food_beverage") }).merge(FoodBeverageSchema),
  BaseProviderSchema.extend({ provider_category: z.literal("conference_events") }).merge(ConferenceEventsSchema),
  BaseProviderSchema.extend({ provider_category: z.literal("local_guide") }).merge(ActivitiesSchema),
  BaseProviderSchema.extend({ provider_category: z.literal("market_vendor") }).merge(MarketVendorSchema),
]);

export type ProviderFormData = z.infer<typeof ProviderFormSchema>;

/**
 * Number inputs left blank by the user arrive in client form state as `""`,
 * not `undefined` — and `z.coerce.number()` happily coerces `""` to `0`
 * (JS's `Number("") === 0`), which would silently record 0 for every
 * untouched optional numeric field instead of leaving it absent. Call this
 * on raw form state before validating with ProviderFormSchema, on both the
 * client (Step3Review) and the server (registerProvider) — same function,
 * not reimplemented twice, so the two can't drift.
 */
export function cleanEmptyStrings(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === "") continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = cleanEmptyStrings(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}
