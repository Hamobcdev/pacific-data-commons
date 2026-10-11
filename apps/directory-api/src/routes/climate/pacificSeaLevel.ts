import { Hono } from "hono";
import { querySeaLevel } from "../../services/pacificSeaLevelService.js";
import type { AppBindings } from "../../types.js";

// UHSLC (University of Hawaii Sea Level Center) tide gauge data, NOAA/NCEI
// co-sponsored — public domain / free-use license. Used instead of BoM
// SEAFRAME per this endpoint's own build brief's hard stop: BoM's
// licensing could not be confirmed (bom.gov.au returned HTTP 403 to every
// fetch attempt this session). See scripts/preprocess-sea-level.mjs for
// the full sourcing doc comment, including why Port Moresby's data is
// historical-only (1991-1993) while the other 7 stations are current
// through July 2026.
//
// Data is bundled as a static JSON asset at build time (no KV writes),
// same pattern as pacificCycloneHistory.ts. 192 monthly records across 8
// Pacific stations: Apia (WS), Suva (FJ), Nuku'alofa (TO), Port Vila (VU),
// Honiara (SB), Tarawa/Betio (KI), Funafuti (TV), Port Moresby (PG).
// mean_sea_level_mm is relative to each station's own local reference
// datum — not directly comparable in absolute terms between stations.
//
// Query params (all optional):
//   station  — station name (case-insensitive substring match), e.g. "Apia"
//   nation   — ISO-2 code, e.g. WS, FJ, TO, VU, SB, KI, TV, PG
//   from     — YYYY-MM, inclusive
//   to       — YYYY-MM, inclusive
//
// Filtering logic lives in services/pacificSeaLevelService.ts so the
// Agent Dataset Gateway's query adapter can reuse it without a second
// in-process HTTP round-trip.

export const pacificSeaLevelRoute = new Hono<AppBindings>();

pacificSeaLevelRoute.get("/climate/pacific-sea-level", async (c) => {
  const result = querySeaLevel({
    station: c.req.query("station"),
    nation: c.req.query("nation"),
    from: c.req.query("from"),
    to: c.req.query("to"),
  });

  c.header("Cache-Control", "public, max-age=86400");
  return c.json(result);
});
