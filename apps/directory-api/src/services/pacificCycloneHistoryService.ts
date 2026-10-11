import ibtracsData from "../data/ibtracs-sp-processed.json";

// Shared query logic for /climate/pacific-cyclone-history and the Agent
// Dataset Gateway's query adapter — extracted from
// routes/climate/pacificCycloneHistory.ts (see that file for the full
// IBTrACS sourcing doc comment) so the two callers can't drift. Static
// JSON asset, no upstream fetch, no cache needed.

export interface Storm {
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

export interface CycloneHistoryQueryParams {
  season?: string;
  nation?: string;
  minCategory?: string;
  landfall?: string;
  limit?: string | number;
}

export interface CycloneHistoryQueryResult {
  data: Storm[];
  meta: {
    total_matching: number;
    returned: number;
    source: string;
    basin: string;
    license: string;
    attribution: string;
    data_url: string;
    filters_applied: {
      season: string | null;
      nation: string | null;
      min_category: string | null;
      landfall: string | null;
    };
  };
}

const CAT_MIN_WIND: Record<string, number> = {
  td: 0,
  c1: 34,
  c2: 48,
  c3: 64,
  c4: 86,
  c5: 108,
};

export function queryCycloneHistory(params: CycloneHistoryQueryParams): CycloneHistoryQueryResult {
  const season = params.season;
  const nation = params.nation?.toUpperCase();
  const minCat = params.minCategory?.toLowerCase();
  const landfall = params.landfall;
  const limit = params.limit !== undefined ? Math.min(parseInt(String(params.limit), 10), 500) : 100;

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

  return {
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
        season: season ?? null,
        nation: nation ?? null,
        min_category: minCat ?? null,
        landfall: landfall ?? null,
      },
    },
  };
}
