import { z } from "zod";
import { DATASET_METADATA, FISHERIES_RECORDS, type FisheriesRecord } from "../data/fisheries.js";
import { ValidationError } from "./errors.js";

const sliceQuerySchema = z.object({
  species: z.enum(["skipjack", "yellowfin", "bigeye"]).optional(),
  year_start: z.coerce
    .number()
    .int()
    .min(DATASET_METADATA.time_period_start)
    .max(DATASET_METADATA.time_period_end)
    .optional(),
  year_end: z.coerce
    .number()
    .int()
    .min(DATASET_METADATA.time_period_start)
    .max(DATASET_METADATA.time_period_end)
    .optional(),
  zone: z.enum(["samoa_eez", "tonga_eez"]).optional(),
});

export interface SliceResult {
  filtered: FisheriesRecord[];
  applied: Record<string, string>;
}

/**
 * Validates and applies /slice query filters. Extracted from the route
 * handler (src/routes/paid/slice.ts) so it's unit-testable without going
 * through Hono or the x402 payment gate — same pattern as
 * apps/directory-api/src/services/searchService.ts's parseSearchFilters.
 *
 * Throws ValidationError on bad input; the route handler lets that
 * propagate so @pdc/x402-adapter cancels the verified-but-unsettled payment
 * instead of charging for a request that never returned data.
 */
export function applySliceFilters(raw: Record<string, string>): SliceResult {
  const parsed = sliceQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    );
  }
  const { species, year_start, year_end, zone } = parsed.data;
  if (year_start !== undefined && year_end !== undefined && year_start > year_end) {
    throw new ValidationError("year_start must be less than or equal to year_end");
  }

  let filtered: FisheriesRecord[] = FISHERIES_RECORDS;
  const applied: Record<string, string> = {};

  if (species) {
    filtered = filtered.filter((r) => r.species === species);
    applied.species = species;
  }
  if (year_start !== undefined) {
    filtered = filtered.filter((r) => r.year >= year_start);
    applied.year_start = String(year_start);
  }
  if (year_end !== undefined) {
    filtered = filtered.filter((r) => r.year <= year_end);
    applied.year_end = String(year_end);
  }
  if (zone) {
    filtered = filtered.filter((r) => r.zone === zone);
    applied.zone = zone;
  }

  return { filtered, applied };
}
