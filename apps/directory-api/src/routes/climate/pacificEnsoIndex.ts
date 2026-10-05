import { Hono } from "hono";
import type { AppBindings } from "../../types.js";
import ensoData from "../../data/enso-mei-processed.json";

// NOAA PSL Multivariate ENSO Index v2 (MEI.v2) — public domain
// https://psl.noaa.gov/enso/mei/
//
// Data is bundled as a static JSON asset at build time (no KV writes), same
// pattern as pacificCycloneHistory.ts. 572 bimonthly records, 1979-present.
// Positive MEI = El Nino conditions, negative = La Nina. `period` approximates
// each bimonthly season (e.g. DJ = Dec-Jan) to its later calendar month — see
// `season` on each record for the true 2-month window; this is a monthly-ish
// index, not a true single-month reading. `phase` is derived at preprocess
// time using the conventional +-0.5 MEI threshold (elnino >= 0.5, lanina <=
// -0.5, otherwise neutral) — the same threshold commonly applied to ONI.
//
// Query params (all optional):
//   year   — 4-digit year, e.g. 2015
//   from   — 4-digit start year (inclusive)
//   to     — 4-digit end year (inclusive)
//   phase  — elnino | lanina | neutral

export const pacificEnsoIndexRoute = new Hono<AppBindings>();

interface EnsoRecord {
  year: number;
  season: string;
  period: string;
  value: number;
  phase: "elnino" | "lanina" | "neutral";
}

pacificEnsoIndexRoute.get("/climate/pacific-enso-index", async (c) => {
  const year  = c.req.query("year");
  const from  = c.req.query("from");
  const to    = c.req.query("to");
  const phase = c.req.query("phase")?.toLowerCase();

  let records: EnsoRecord[] = (ensoData as { records: EnsoRecord[] }).records;

  if (year) {
    const yr = parseInt(year, 10);
    records = records.filter((r) => r.year === yr);
  }
  if (from) {
    const fromYr = parseInt(from, 10);
    records = records.filter((r) => r.year >= fromYr);
  }
  if (to) {
    const toYr = parseInt(to, 10);
    records = records.filter((r) => r.year <= toYr);
  }
  if (phase === "elnino" || phase === "lanina" || phase === "neutral") {
    records = records.filter((r) => r.phase === phase);
  }

  c.header("Cache-Control", "public, max-age=86400");

  return c.json({
    data: records,
    meta: {
      total_matching: records.length,
      source: (ensoData as { meta: { source: string } }).meta.source,
      license: (ensoData as { meta: { license: string } }).meta.license,
      url: (ensoData as { meta: { url: string } }).meta.url,
      note: (ensoData as { meta: { note: string } }).meta.note,
      data_currency: "monthly",
      filters_applied: {
        year:  year  ?? null,
        from:  from  ?? null,
        to:    to    ?? null,
        phase: phase ?? null,
      },
    },
  });
});
