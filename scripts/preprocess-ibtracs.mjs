import { readFileSync, writeFileSync } from 'fs'

const csv = readFileSync('data/ibtracs-sp.csv', 'utf-8')
const lines = csv.split('\n')
const headers = lines[0].split(',').map(h => h.trim().toUpperCase())

const IDX = {
  sid:    headers.indexOf('SID'),
  name:   headers.indexOf('NAME'),
  season: headers.indexOf('SEASON'),
  basin:  headers.indexOf('BASIN'),
  time:   headers.indexOf('ISO_TIME'),
  wind:   headers.indexOf('USA_WIND'),
  pres:   headers.indexOf('USA_PRES'),
  lat:    headers.indexOf('LAT'),
  lon:    headers.indexOf('LON'),
  land:   headers.indexOf('LANDFALL'),
}

const NATIONS = {
  FJ: [[-21,177,-15,180],[-21,-180,-15,-178]],
  WS: [[-15,-173,-13,-171]],
  TO: [[-22,-177,-15,-173]],
  VU: [[-20,166,-13,171]],
  SB: [[-11,155,-5,167]],
  PF: [[-27,-154,-8,-134]],
  NC: [[-22,163,-20,168]],
  CK: [[-22,-166,-8,-157]],
  TV: [[-10,176,-5,180]],
  KI: [[-4,172,4,177]],
}

function inBox(lat, lon, boxes) {
  return boxes.some(([a,b,c,d]) => lat>=a && lat<=c && lon>=b && lon<=d)
}

function category(kt) {
  if (!kt || kt < 34) return 'TD'
  if (kt < 48) return 'C1'
  if (kt < 64) return 'C2'
  if (kt < 86) return 'C3'
  if (kt < 108) return 'C4'
  return 'C5'
}

const storms = new Map()

for (let i = 2; i < lines.length; i++) {
  const cols = lines[i].split(',')
  if (cols.length < 10) continue
  const sid = cols[IDX.sid]?.trim()
  if (!sid) continue

  const t    = cols[IDX.time]?.trim()
  const wind = parseFloat(cols[IDX.wind]) || null
  const pres = parseFloat(cols[IDX.pres]) || null
  const lat  = parseFloat(cols[IDX.lat])
  const lon  = parseFloat(cols[IDX.lon])
  const land = cols[IDX.land]?.trim() === '1'

  if (!storms.has(sid)) {
    storms.set(sid, {
      id: sid,
      name: cols[IDX.name]?.trim() || 'UNNAMED',
      season: parseInt(cols[IDX.season]) || 0,
      basin: cols[IDX.basin]?.trim() || 'SP',
      start: t, end: t,
      peak_wind_kt: wind,
      peak_pres_mb: pres,
      landfall: land,
      cat: category(wind),
      nations: [],
      points: 1,
    })
  } else {
    const s = storms.get(sid)
    s.end = t || s.end
    s.points++
    if (land) s.landfall = true
    if (wind && (!s.peak_wind_kt || wind > s.peak_wind_kt)) { s.peak_wind_kt = wind; s.cat = category(wind) }
    if (pres && (!s.peak_pres_mb || pres < s.peak_pres_mb)) s.peak_pres_mb = pres
    if (!isNaN(lat) && !isNaN(lon)) {
      for (const [code, boxes] of Object.entries(NATIONS)) {
        if (!s.nations.includes(code) && inBox(lat, lon, boxes)) s.nations.push(code)
      }
    }
  }
}

const out = Array.from(storms.values())
  .filter(s => s.season >= 1960)
  .sort((a,b) => b.season - a.season || b.start.localeCompare(a.start))

const payload = {
  meta: {
    source: 'IBTrACS v04r01',
    basin: 'SP',
    license: 'Public Domain (NOAA/NCEI)',
    attribution: 'Knapp et al. 2010, Bull. Amer. Meteor. Soc., 91, 363-376',
    url: 'https://www.ncei.noaa.gov/products/international-best-track-archive',
    generated: new Date().toISOString(),
    storms: out.length,
  },
  storms: out,
}

writeFileSync('data/ibtracs-sp-processed.json', JSON.stringify(payload))
const kb = Math.round(JSON.stringify(payload).length / 1024)
console.log(`✅ Wrote ${out.length} storms, ${kb} KB → data/ibtracs-sp-processed.json`)
