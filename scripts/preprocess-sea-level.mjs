import { writeFileSync } from 'fs'

// UHSLC (University of Hawaii Sea Level Center) tide gauge data, via its
// public ERDDAP server — used instead of BoM SEAFRAME per this endpoint's
// own build brief: BoM's licensing could not be confirmed (bom.gov.au
// returned HTTP 403 to every fetch attempt this session), so per the
// brief's own hard-stop instruction, UHSLC is used instead. UHSLC's own
// ERDDAP license attribute: "The data may be used and redistributed for
// free..." (NOAA/NCEI co-sponsored).
//
// Station list and uhslc_id values confirmed live via
// /erddap/tabledap/global_daily_fast.json?station_name,station_country,uhslc_id,latitude,longitude&distinct()
// (and global_daily_rqds for the same query) before writing this script —
// not guessed. "Betio" (the brief's own station list) is UHSLC's "Tarawa"
// station (uhslc_id 2) — Betio is the islet on South Tarawa where the
// gauge sits; UHSLC does not list a separate "Betio" station name.
//
// Two UHSLC datasets, used for different reasons per station — confirmed
// live before writing this script, not assumed from either dataset's name
// alone:
//   - global_daily_fast (Fast Delivery): preliminary, less rigorously
//     quality-controlled, but current through July 2026 for all 7
//     stations below that have an active gauge feed.
//   - global_daily_rqds (Research Quality): fully QC'd but lags ~3-5
//     years behind present for most stations, and for Port Moresby (PNG)
//     specifically, confirmed live to end in Dec 1993 — PNG has no entry
//     at all in global_daily_fast, so there is no current UHSLC feed for
//     it. Included anyway (the brief's own station list names it) but
//     explicitly marked historical, not re-labelled as current.
const STATIONS = [
  { nation: 'WS', country: 'Samoa',           station: 'Apia',          uhslc_id: 401, dataset: 'global_daily_fast', quality: 'fast_delivery_preliminary' },
  { nation: 'FJ', country: 'Fiji',             station: 'Suva',          uhslc_id: 18,  dataset: 'global_daily_fast', quality: 'fast_delivery_preliminary' },
  { nation: 'TO', country: 'Tonga',            station: "Nuku'alofa",    uhslc_id: 38,  dataset: 'global_daily_fast', quality: 'fast_delivery_preliminary' },
  { nation: 'VU', country: 'Vanuatu',          station: 'Port Vila',     uhslc_id: 46,  dataset: 'global_daily_fast', quality: 'fast_delivery_preliminary' },
  { nation: 'SB', country: 'Solomon Islands',  station: 'Honiara',       uhslc_id: 9,   dataset: 'global_daily_fast', quality: 'fast_delivery_preliminary' },
  { nation: 'KI', country: 'Kiribati',         station: 'Tarawa (Betio)', uhslc_id: 2,  dataset: 'global_daily_fast', quality: 'fast_delivery_preliminary' },
  { nation: 'TV', country: 'Tuvalu',           station: 'Funafuti',      uhslc_id: 25,  dataset: 'global_daily_fast', quality: 'fast_delivery_preliminary' },
  { nation: 'PG', country: 'Papua New Guinea', station: 'Port Moresby',  uhslc_id: 64,  dataset: 'global_daily_rqds', quality: 'research_quality_historical' },
]

const ERDDAP_BASE = 'https://uhslc.soest.hawaii.edu/erddap/tabledap'
const FILL_VALUE = -32767
const MONTHS_WINDOW = 24

async function fetchStationDaily(dataset, uhslcId) {
  // No time constraint: each station's own recency varies (see header
  // comment) — easier and more honest to pull everything and window by
  // month count in code than to guess a calendar range per station.
  const url = `${ERDDAP_BASE}/${dataset}.json?time,sea_level,quality&uhslc_id=${uhslcId}`
  const res = await fetch(url)
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`ERDDAP ${dataset}/${uhslcId} -> HTTP ${res.status}`)
  const json = await res.json()
  return json.table.rows // [time, sea_level_mm, quality]
}

function monthKey(isoTime) {
  return isoTime.slice(0, 7) // YYYY-MM
}

async function main() {
  const allRecords = []
  const stationRanges = []

  for (const s of STATIONS) {
    const rows = await fetchStationDaily(s.dataset, s.uhslc_id)
    const byMonth = new Map()

    for (const [time, seaLevel] of rows) {
      if (seaLevel === null || seaLevel === FILL_VALUE) continue
      const key = monthKey(time)
      if (!byMonth.has(key)) byMonth.set(key, [])
      byMonth.get(key).push(seaLevel)
    }

    const months = Array.from(byMonth.keys()).sort()
    const windowed = months.slice(-MONTHS_WINDOW)

    for (const period of windowed) {
      const values = byMonth.get(period)
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      allRecords.push({
        nation: s.nation,
        country: s.country,
        station: s.station,
        uhslc_id: s.uhslc_id,
        period,
        mean_sea_level_mm: Math.round(mean * 10) / 10,
        days_observed: values.length,
        data_quality: s.quality,
      })
    }

    const range = windowed.length ? `${windowed[0]} to ${windowed[windowed.length - 1]}` : 'no data';
    stationRanges.push(`${s.station} (${s.nation}): ${windowed.length} months [${range}]`)
    console.log(`${s.station} (${s.nation}): ${windowed.length} months [${range}], ${rows.length} daily readings fetched`)
  }

  allRecords.sort((a, b) => b.period.localeCompare(a.period) || a.nation.localeCompare(b.nation))

  const payload = {
    meta: {
      source: 'University of Hawaii Sea Level Center (UHSLC) — Fast Delivery (preliminary) and Research Quality (QC\'d) daily tide gauge data, NOAA/NCEI co-sponsored',
      license: "Free use and redistribution (UHSLC ERDDAP license statement) — not BoM SEAFRAME; see this script's header comment for why",
      url: 'https://uhslc.soest.hawaii.edu/data/',
      generated: new Date().toISOString(),
      records: allRecords.length,
      station_coverage: stationRanges,
      note: "mean_sea_level_mm is relative to each station's own local reference datum (short-term tide gauge zero) — NOT a geodetic/absolute datum, and not directly comparable in absolute terms between stations without datum correction. Values are monthly means computed here from UHSLC daily readings, not a UHSLC-published monthly product. data_quality on each record distinguishes UHSLC's preliminary Fast Delivery stream from its fully quality-controlled Research Quality stream — Port Moresby (PNG) has no current UHSLC feed at all and is included from Research Quality data only, which ends in 1993.",
    },
    records: allRecords,
  }

  writeFileSync('data/pacific-sea-level-processed.json', JSON.stringify(payload))
  const kb = Math.round(JSON.stringify(payload).length / 1024)
  console.log(`Wrote ${allRecords.length} monthly records, ${kb} KB -> data/pacific-sea-level-processed.json`)
}

main()
