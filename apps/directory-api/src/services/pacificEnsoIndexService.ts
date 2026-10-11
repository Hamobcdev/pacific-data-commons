import ensoData from "../data/enso-mei-processed.json";

// Shared query logic for /climate/pacific-enso-index and the Agent
// Dataset Gateway's query adapter — extracted from
// routes/climate/pacificEnsoIndex.ts (see that file for the full NOAA
// PSL MEI.v2 sourcing doc comment) so the two callers can't drift.
// Static JSON asset, no upstream fetch, no cache needed.

export interface EnsoRecord {
  year: number;
  season: string;
  period: string;
  value: number;
  phase: "elnino" | "lanina" | "neutral";
}

export interface EnsoIndexQueryParams {
  year?: string;
  from?: string;
  to?: string;
  phase?: string;
}

export interface EnsoIndexQueryResult {
  data: EnsoRecord[];
  meta: {
    total_matching: number;
    source: string;
    license: string;
    url: string;
    note: string;
    data_currency: "monthly";
    filters_applied: {
      year: string | null;
      from: string | null;
      to: string | null;
      phase: string | null;
    };
  };
}

export function queryEnsoIndex(params: EnsoIndexQueryParams): EnsoIndexQueryResult {
  const year = params.year;
  const from = params.from;
  const to = params.to;
  const phase = params.phase?.toLowerCase();

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

  return {
    data: records,
    meta: {
      total_matching: records.length,
      source: (ensoData as { meta: { source: string } }).meta.source,
      license: (ensoData as { meta: { license: string } }).meta.license,
      url: (ensoData as { meta: { url: string } }).meta.url,
      note: (ensoData as { meta: { note: string } }).meta.note,
      data_currency: "monthly",
      filters_applied: {
        year: year ?? null,
        from: from ?? null,
        to: to ?? null,
        phase: phase ?? null,
      },
    },
  };
}
