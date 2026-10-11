import { Hono } from "hono";
import { queryEnsoIndex } from "../../services/pacificEnsoIndexService.js";
import type { AppBindings } from "../../types.js";

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
//
// Filtering logic lives in services/pacificEnsoIndexService.ts so the
// Agent Dataset Gateway's query adapter can reuse it.

export const pacificEnsoIndexRoute = new Hono<AppBindings>();

pacificEnsoIndexRoute.get("/climate/pacific-enso-index", async (c) => {
  const result = queryEnsoIndex({
    year: c.req.query("year"),
    from: c.req.query("from"),
    to: c.req.query("to"),
    phase: c.req.query("phase"),
  });

  c.header("Cache-Control", "public, max-age=86400");
  return c.json(result);
});
