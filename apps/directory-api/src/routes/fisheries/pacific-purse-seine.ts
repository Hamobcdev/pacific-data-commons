import { Hono } from "hono";
import { getPurseSeineCatch, DEFAULT_SPECIES, VALID_SPECIES, isValidSpecies, MIN_YEAR, MAX_YEAR } from "../../services/pacificFisheriesPurseSeineService.js";
import { AppError, ValidationError } from "../../lib/errors.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts (Tier 2 / $0.05, Decisions 59/60 — a
// first-party utility wrapper over WCPFC's already-openly-accessible
// Public Domain THREDDS/OPeNDAP dataset, not a paywall on the underlying
// data). See services/pacificFisheriesPurseSeineService.ts for the full
// sourcing/caching doc comment, including the real variable layout and
// coverage range confirmed live against THREDDS — several assumptions in
// this route's original spec (SKJ_C/YFT_C/BET_C/ALB_C/SETS variable
// names, "1950s–2022/2023" coverage, an optional year param) didn't match
// the real dataset and were corrected before this route was built.
//
// Query params:
//   species (optional) — skj | yft | bet. Default skj. Albacore (alb) is
//     rejected with an explicit explanation, not served as a fabricated
//     zero — this purse-seine dataset has no albacore variable at all
//     (albacore isn't a purse-seine target species).
//   year (REQUIRED) — 4-digit year, MIN_YEAR..MAX_YEAR (the dataset's
//     live-verified coverage). Required, not optional: an unconstrained
//     request would need to sum the entire 628-month grid (~200MB+ of
//     ASCII), which isn't workable for a live paid endpoint.
export const pacificPurseSeineRoute = new Hono<AppBindings>();

pacificPurseSeineRoute.get("/fisheries/pacific-purse-seine", async (c) => {
  const speciesRaw = (c.req.query("species") ?? DEFAULT_SPECIES).toLowerCase();

  if (speciesRaw === "alb") {
    throw new ValidationError(
      "Albacore (alb) is not available from this dataset — albacore is primarily caught by longline, not purse seine, so WCPFC's purse-seine 1x1 product has no albacore variable. Supported species: skj, yft, bet.",
    );
  }
  if (!isValidSpecies(speciesRaw)) {
    throw new ValidationError(`species must be one of: ${VALID_SPECIES.join(", ")} (got "${speciesRaw}")`);
  }

  const yearRaw = c.req.query("year");
  if (!yearRaw) {
    throw new ValidationError(`year is required, e.g. ?year=2020 (dataset covers ${MIN_YEAR}–${MAX_YEAR})`);
  }
  if (!/^\d{4}$/.test(yearRaw)) {
    throw new ValidationError("year must be a 4-digit year, e.g. ?year=2020");
  }
  const year = Number(yearRaw);
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new ValidationError(`year must be between ${MIN_YEAR} and ${MAX_YEAR} (dataset coverage)`);
  }

  const result = await getPurseSeineCatch(speciesRaw, year);
  if (!result) {
    // A valid species/year with no result means THREDDS itself was
    // unreachable/erroring this run — a third-party outage, not a server
    // error (matches ocean-temperature.ts's/pacific-ocean-temp.ts's
    // identical posture).
    throw new AppError(503, "service_unavailable", "Purse seine catch data is temporarily unavailable. Try again shortly.");
  }

  // 24-hour cache, same value mirrored here as a standard HTTP cache hint
  // (pacificFisheriesPurseSeineService.ts's doc comment has the TTL
  // reasoning) — same pattern as samoa-cpi.ts's Cache-Control header.
  c.header("Cache-Control", "public, max-age=86400");

  return c.json(result);
});
