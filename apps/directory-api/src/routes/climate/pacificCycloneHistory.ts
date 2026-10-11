import { Hono } from "hono";
import { queryCycloneHistory } from "../../services/pacificCycloneHistoryService.js";
import type { AppBindings } from "../../types.js";

// IBTrACS South Pacific Basin — NOAA/NCEI public domain
// https://www.ncei.noaa.gov/products/international-best-track-archive
// Version: v04r01 | License: Public Domain (US Government Work)
// Attribution: Knapp et al. 2010, Bull. Amer. Meteor. Soc., 91, 363-376
//
// Data is bundled as a static JSON asset at build time (no KV writes).
// 851 storms, 1960–present, South Pacific basin.
//
// Query params (all optional):
//   season        — 4-digit year, e.g. 2024
//   nation        — ISO 2-letter code, e.g. FJ, WS, TO, VU, SB, PF, CK, TV, KI
//   min_category  — td | c1 | c2 | c3 | c4 | c5
//   landfall      — true  (only storms that made landfall)
//   limit         — max results, default 100, max 500
//
// Filtering logic lives in services/pacificCycloneHistoryService.ts so
// the Agent Dataset Gateway's query adapter can reuse it.

export const pacificCycloneHistoryRoute = new Hono<AppBindings>();

pacificCycloneHistoryRoute.get("/climate/pacific-cyclone-history", async (c) => {
  const result = queryCycloneHistory({
    season: c.req.query("season"),
    nation: c.req.query("nation"),
    minCategory: c.req.query("min_category"),
    landfall: c.req.query("landfall"),
    limit: c.req.query("limit"),
  });

  c.header("Cache-Control", "public, max-age=3600");
  return c.json(result);
});
