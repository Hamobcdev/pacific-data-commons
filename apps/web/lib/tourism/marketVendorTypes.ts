import type { SelectOption } from "@/components/ui/select";

/**
 * tourism_markets.market_type is a SINGLE-value TEXT CHECK column describing
 * the market itself (not a per-vendor multi-select of what's sold — Phase C's
 * original brief asked for a "vendor_type" multi-select with a different,
 * non-overlapping vocabulary; that was audited against the live schema and
 * replaced below with the real CHECK values). Kept this file's name from the
 * brief even though its export is now market-type, not vendor-type, to avoid
 * an unrequested rename.
 */
export const MARKET_TYPE_VALUES = ["produce", "craft", "fish", "mixed", "flea", "night_market", "farmers_market"] as const;

export type MarketType = (typeof MARKET_TYPE_VALUES)[number];

export const MARKET_TYPE_OPTIONS: SelectOption[] = [
  { value: "produce", label: "Produce Market" },
  { value: "craft", label: "Craft Market" },
  { value: "fish", label: "Fish Market" },
  { value: "mixed", label: "Mixed Market" },
  { value: "flea", label: "Flea Market" },
  { value: "night_market", label: "Night Market" },
  { value: "farmers_market", label: "Farmers Market" },
];

/** tourism_markets.operating_days TEXT[]. */
export const OPERATING_DAY_VALUES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "public_holiday",
] as const;

export const OPERATING_DAY_OPTIONS: SelectOption[] = OPERATING_DAY_VALUES.map((v) => ({
  value: v,
  label: v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
}));

/** tourism_transport.booking_method TEXT[]. */
export const BOOKING_METHOD_VALUES = ["online", "phone", "in_person", "agent"] as const;

export const BOOKING_METHOD_OPTIONS: SelectOption[] = [
  { value: "online", label: "Online" },
  { value: "phone", label: "Phone" },
  { value: "in_person", label: "In Person" },
  { value: "agent", label: "Through an Agent" },
];
