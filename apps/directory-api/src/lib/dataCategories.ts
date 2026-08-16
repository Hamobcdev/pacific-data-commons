/**
 * Must stay in sync with the `endpoints.data_category` CHECK constraint in
 * supabase/migrations/session1_migration.sql. Postgres CHECK constraints
 * aren't introspectable at runtime the way a real enum type would be, so
 * this list is the single source of truth on the API side — update both
 * places together if a category is ever added.
 */
export const DATA_CATEGORIES = [
  "fisheries",
  "climate",
  "trade",
  "demographics",
  "health",
  "agriculture",
  "cultural",
  "remittance",
  "legal",
  "geospatial",
  "energy",
  "carbon",
  "tourism",
  "disaster_risk",
  "biodiversity",
  "ocean",
  "education",
  "governance",
  "financial_flows",
  "research",
  "other",
] as const;

export type DataCategory = (typeof DATA_CATEGORIES)[number];

export function isDataCategory(value: string): value is DataCategory {
  return (DATA_CATEGORIES as readonly string[]).includes(value);
}
