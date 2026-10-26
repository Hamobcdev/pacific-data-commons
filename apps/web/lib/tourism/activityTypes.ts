import type { SelectOption } from "@/components/ui/select";

/**
 * tourism_activities.activity_type is a SINGLE-value TEXT CHECK column (not
 * an array) — see supabase/migrations/20261026000001_pacific_tourism_schema.sql.
 * This is the exact, full CHECK vocabulary, verbatim. Phase C's original
 * brief listed a different, non-overlapping set of values per category
 * (multi-select, water/tour/guide-specific) — that was audited against this
 * live schema and replaced with curated subsets of the REAL enum below, per
 * the approved resolution. Do not add values here that aren't in the DB
 * CHECK constraint — an insert would fail.
 */
export const ACTIVITY_TYPE_VALUES = [
  "dive_site",
  "snorkel_site",
  "surf_break",
  "whale_watching",
  "cultural",
  "hiking",
  "fishing_charter",
  "water_sport",
  "day_trip",
  "out_to_island",
  "market_tour",
  "village_immersion",
  "cooking_class",
  "craft_workshop",
  "film_location",
  "birdwatching",
  "caving",
  "cycling",
  "horse_riding",
  "fiafia_night",
  "kava_ceremony",
  "church_visit",
  "historical_site",
  "archaeological_site",
  "private_island_hire",
  "sandbar_excursion",
  "whale_swim",
  "sport_fishing",
  "windsurfing",
  "kitesurfing",
  "kayaking",
  "paddleboard",
  "parasailing",
  "glassbottom_boat",
  "waterfall",
  "blue_hole",
  "volcano_tour",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPE_VALUES)[number];

function toOption(value: string): SelectOption {
  return { value, label: value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) };
}

/** Curated subset shown when provider_category === 'water_activities'. */
export const WATER_ACTIVITY_OPTIONS: SelectOption[] = [
  "dive_site",
  "snorkel_site",
  "surf_break",
  "whale_watching",
  "fishing_charter",
  "water_sport",
  "whale_swim",
  "sport_fishing",
  "windsurfing",
  "kitesurfing",
  "kayaking",
  "paddleboard",
  "parasailing",
  "glassbottom_boat",
  "sandbar_excursion",
  "blue_hole",
].map(toOption);

/** Curated subset shown when provider_category === 'tour_operator'. */
export const TOUR_OPERATOR_OPTIONS: SelectOption[] = [
  "cultural",
  "hiking",
  "day_trip",
  "out_to_island",
  "market_tour",
  "village_immersion",
  "cooking_class",
  "craft_workshop",
  "film_location",
  "birdwatching",
  "caving",
  "cycling",
  "horse_riding",
  "fiafia_night",
  "kava_ceremony",
  "church_visit",
  "historical_site",
  "archaeological_site",
  "private_island_hire",
  "waterfall",
  "volcano_tour",
].map(toOption);

/** Curated subset shown when provider_category === 'local_guide'. The real
 * enum has no interpreter/photography-guide-specific values, so this
 * overlaps tour_operator's cultural/land-based options rather than
 * inventing values that don't exist in the CHECK constraint. */
export const LOCAL_GUIDE_OPTIONS: SelectOption[] = [
  "cultural",
  "historical_site",
  "archaeological_site",
  "church_visit",
  "village_immersion",
  "market_tour",
  "birdwatching",
  "hiking",
  "kava_ceremony",
  "fiafia_night",
  "craft_workshop",
].map(toOption);

/** tourism_activities.certification_type TEXT[] — water_activities only. */
export const CERTIFICATION_TYPE_VALUES = ["open_water", "advanced", "rescue", "technical", "padi", "ssi", "naui"] as const;

export const CERTIFICATION_TYPE_OPTIONS: SelectOption[] = [
  { value: "open_water", label: "Open Water" },
  { value: "advanced", label: "Advanced" },
  { value: "rescue", label: "Rescue" },
  { value: "technical", label: "Technical" },
  { value: "padi", label: "PADI" },
  { value: "ssi", label: "SSI" },
  { value: "naui", label: "NAUI" },
];

/** tourism_activities.price_per CHECK column. */
export const PRICE_PER_VALUES = ["person", "group", "vessel", "day", "half_day"] as const;

export const PRICE_PER_OPTIONS: SelectOption[] = [
  { value: "person", label: "Per Person" },
  { value: "group", label: "Per Group" },
  { value: "vessel", label: "Per Vessel" },
  { value: "day", label: "Per Day" },
  { value: "half_day", label: "Per Half Day" },
];
