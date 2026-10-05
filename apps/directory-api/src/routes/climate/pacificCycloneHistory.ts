import { Hono } from "hono";
import type { AppBindings } from "../../types.js";
import ibtracsData from "../../data/ibtracs-sp-processed.json";

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

export const pacificCycloneHistoryRoute = new Hono<AppBindings>();

interface Storm {
  id: string;
  name: string;
  season: number;
  basin: string;
  start: string;
  end: string;
  peak_wind_kt: number | null;
  peak_pres_mb: number | null;
  landfall: boolean;
  cat: string;
  nations: string[];
  points: number;
}

const CAT_MIN_WIND: Record<string, number> = {
  td: 0, c1: 34, c2: 48, c3: 64, c4: 86, c5: 108,
};

pacificCycloneHistoryRoute.get("/climate/pacific-cyclone-history", async (c) => {
  const season   = c.req.query("season");
  const nation   = c.req.query("nation")?.toUpperCase();
  const minCat   = c.req.query("min_category")?.toLowerCase();
  const landfall = c.req.query("landfall");
  const limitStr = c.req.query("limit");
  const limit    = limitStr ? Math.min(parseInt(limitStr, 10), 500) : 100;

  let storms: Storm[] = (ibtracsData as { storms: Storm[] }).storms;

  if (season) {
    const yr = parseInt(season, 10);
    storms = storms.filter((s) => s.season === yr);
  }
  if (nation) {
    storms = storms.filter((s) => s.nations.includes(nation));
  }
  if (minCat !== undefined && CAT_MIN_WIND[minCat] !== undefined) {
    const minWind = CAT_MIN_WIND[minCat] as number;
    storms = storms.filter((s) => (s.peak_wind_kt ?? 0) >= minWind);
  }
  if (landfall === "true") {
    storms = storms.filter((s) => s.landfall);
  }

  const paginated = storms.slice(0, limit);

  c.header("Cache-Control", "public, max-age=3600");

  return c.json({
    data: paginated,
    meta: {
      total_matching: storms.length,
      returned: paginated.length,
      source: (ibtracsData as { meta: { source: string } }).meta.source,
      basin: (ibtracsData as { meta: { basin: string } }).meta.basin,
      license: (ibtracsData as { meta: { license: string } }).meta.license,
      attribution: (ibtracsData as { meta: { attribution: string } }).meta.attribution,
      data_url: (ibtracsData as { meta: { url: string } }).meta.url,
      filters_applied: {
        season:       season   ?? null,
        nation:       nation   ?? null,
        min_category: minCat   ?? null,
        landfall:     landfall ?? null,
      },
    },
  });
});
