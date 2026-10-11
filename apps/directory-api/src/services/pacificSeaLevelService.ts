import seaLevelData from "../data/pacific-sea-level-processed.json";

// Shared query logic for /climate/pacific-sea-level and the Agent Dataset
// Gateway's query adapter — extracted from routes/climate/pacificSeaLevel.ts
// (see that file for the full UHSLC sourcing doc comment) so the two
// callers can't drift. Static JSON asset, no upstream fetch, no cache
// needed — same reasoning as pacificCycloneHistory.ts.

export interface SeaLevelRecord {
  nation: string;
  country: string;
  station: string;
  uhslc_id: number;
  period: string;
  mean_sea_level_mm: number;
  days_observed: number;
  data_quality: string;
}

export interface SeaLevelQueryParams {
  station?: string;
  nation?: string;
  from?: string;
  to?: string;
}

export interface SeaLevelQueryResult {
  data: SeaLevelRecord[];
  meta: {
    total_matching: number;
    source: string;
    license: string;
    url: string;
    note: string;
    station_coverage: string[];
    data_currency: "monthly";
    filters_applied: {
      station: string | null;
      nation: string | null;
      from: string | null;
      to: string | null;
    };
  };
}

export function querySeaLevel(params: SeaLevelQueryParams): SeaLevelQueryResult {
  const station = params.station?.toLowerCase();
  const nation = params.nation?.toUpperCase();
  const from = params.from;
  const to = params.to;

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

  return {
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
        nation: nation ?? null,
        from: from ?? null,
        to: to ?? null,
      },
    },
  };
}
