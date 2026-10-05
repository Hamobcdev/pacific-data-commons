import { readFileSync, writeFileSync } from 'fs'

// NOAA PSL Multivariate ENSO Index v2 (MEI.v2) — fixed-format text file.
// First line: start-year end-year. Then one line per year: YEAR followed by
// 12 bimonthly season values (DJ JF FM MA AM MJ JJ JA AS SO ON ND). Missing
// values are -999.00 (current/incomplete seasons at the tail of the file).
// Footer lines (a trailing "-999.00" and description text) are ignored.
const raw = readFileSync('data/meiv2.data', 'utf-8')
const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)

const SEASONS = ['DJ', 'JF', 'FM', 'MA', 'AM', 'MJ', 'JJ', 'JA', 'AS', 'SO', 'ON', 'ND']
// Approximate each bimonthly season to its later calendar month (DJ -> Jan,
// JF -> Feb, ..., ND -> Dec) so the API can expose a single YYYY-MM period
// field — the same simplification most MEI consumers use. Documented in the
// route's own description, not presented as an exact monthly reading.
const SEASON_MONTH = { DJ: 1, JF: 2, FM: 3, MA: 4, AM: 5, MJ: 6, JJ: 7, JA: 8, AS: 9, SO: 10, ON: 11, ND: 12 }

function phaseOf(value) {
  if (value >= 0.5) return 'elnino'
  if (value <= -0.5) return 'lanina'
  return 'neutral'
}

const records = []
// Skip line 0 (start/end year header). Stop at the first line that isn't
// "YEAR val val val ... val" (12 values) — that's the footer.
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(/\s+/)
  if (cols.length !== 13) break
  const year = parseInt(cols[0], 10)
  if (!Number.isInteger(year)) break

  for (let s = 0; s < 12; s++) {
    const value = parseFloat(cols[s + 1])
    if (!Number.isFinite(value) || value <= -999) continue
    const month = SEASON_MONTH[SEASONS[s]]
    records.push({
      year,
      season: SEASONS[s],
      period: `${year}-${String(month).padStart(2, '0')}`,
      value: Math.round(value * 100) / 100,
      phase: phaseOf(value),
    })
  }
}

records.sort((a, b) => b.year - a.year || b.period.localeCompare(a.period))

const payload = {
  meta: {
    source: 'NOAA PSL Multivariate ENSO Index v2 (MEI.v2)',
    license: 'Public Domain (NOAA)',
    url: 'https://psl.noaa.gov/enso/mei/',
    generated: new Date().toISOString(),
    records: records.length,
    note: 'period approximates each bimonthly MEI.v2 season to its later calendar month (e.g. DJ -> January) — see season for the true 2-month window.',
  },
  records,
}

writeFileSync('data/enso-mei-processed.json', JSON.stringify(payload))
const kb = Math.round(JSON.stringify(payload).length / 1024)
console.log(`Wrote ${records.length} MEI.v2 records, ${kb} KB -> data/enso-mei-processed.json`)
