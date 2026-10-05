import { Hono } from "hono";
import type { AppBindings } from "../../types.js";
import seaLevelData from "../../data/pacific-sea-level-processed.json";

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

export const pacificSeaLevelRoute = new Hono<AppBindings>();

interface SeaLevelRecord {
  nation: string;
  country: string;
  station: string;
  uhslc_id: number;
  period: string;
  mean_sea_level_mm: number;
  days_observed: number;
  data_quality: string;
}

pacificSeaLevelRoute.get("/climate/pacific-sea-level", async (c) => {
  const station = c.req.query("station")?.toLowerCase();
  const nation  = c.req.query("nation")?.toUpperCase();
  const from    = c.req.query("from");
  const to      = c.req.query("to");

  let records: SeaLevelRecord[] = (seaLevelData as { records: SeaLevelRecord[] }).records;

  if (station) {
    records = records.filter((r) => r.station.toLowerCase().includes(station));
  }
  if (nation) {
    records = records.filter((r) => r.nation === nation);
  }
  if (from) {
    records = records.filter((r) => r.period >= from);
  }
  if (to) {
    records = records.filter((r) => r.period <= to);
  }

  c.header("Cache-Control", "public, max-age=86400");

  return c.json({
    data: records,
    meta: {
      total_matching: records.length,
      source: (seaLevelData as { meta: { source: string } }).meta.source,
      license: (seaLevelData as { meta: { license: string } }).meta.license,
      url: (seaLevelData as { meta: { url: string } }).meta.url,
      note: (seaLevelData as { meta: { note: string } }).meta.note,
      station_coverage: (seaLevelData as { meta: { station_coverage: string[] } }).meta.station_coverage,
      data_currency: "monthly",
      filters_applied: {
        station: station ?? null,
        nation:  nation  ?? null,
        from:    from    ?? null,
        to:      to      ?? null,
      },
    },
  });
});
