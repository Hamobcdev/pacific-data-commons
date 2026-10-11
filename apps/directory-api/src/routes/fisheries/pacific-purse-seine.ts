import { Hono } from "hono";
import { getPurseSeineCatch, parsePurseSeineParams } from "../../services/pacificFisheriesPurseSeineService.js";
import { AppError } from "../../lib/errors.js";
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
  const { species, year } = parsePurseSeineParams(c.req.query("species"), c.req.query("year"));

  const result = await getPurseSeineCatch(species, year);
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
