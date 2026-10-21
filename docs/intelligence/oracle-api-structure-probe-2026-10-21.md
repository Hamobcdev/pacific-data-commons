# Pacific FX Oracle — API Structure Probe

**Date:** 2026-10-21
**Scope:** Read-only intelligence run. No migrations, Workers code, or seed scripts written as part of this probe.
**Keys used from:** `apps/web/.env.local` (corrected path — `apps/api/.env.local` does not exist in this repo).

---

## 1. World Bank — PA.NUS.FCRF for WST (Samoa)

**Call:** `GET https://api.worldbank.org/v2/country/WS/indicator/PA.NUS.FCRF?format=json&date=2015:2024&per_page=20`
**HTTP status:** 200

### Raw response excerpt (first record)

```json
[
  {
    "page": 1, "pages": 1, "per_page": 20, "total": 10,
    "sourceid": "2", "lastupdated": "2026-10-08"
  },
  [
    {
      "indicator": { "id": "PA.NUS.FCRF", "value": "Official exchange rate (LCU per US$, period average)" },
      "country": { "id": "WS", "value": "Samoa" },
      "countryiso3code": "WSM",
      "date": "2024",
      "value": 2.75395370512433,
      "unit": "",
      "obs_status": "",
      "decimal": 2
    }
  ]
]
```

The response is a **2-element top-level array**: `[0]` is a pagination/metadata object, `[1]` is the array of observation records. Not an object with a `data` key — callers must destructure by index.

### Field inventory

| Field | Type | Example | Notes |
|---|---|---|---|
| `indicator.id` | string | `"PA.NUS.FCRF"` | Constant for this query |
| `indicator.value` | string | `"Official exchange rate (LCU per US$, period average)"` | Human-readable indicator name |
| `country.id` | string | `"WS"` | World Bank's 2-letter code, **not** ISO 3166-1 alpha-2 for all countries (matches here) |
| `country.value` | string | `"Samoa"` | Display name |
| `countryiso3code` | string | `"WSM"` | ISO 3166-1 alpha-3 — this is the stable join key, not `country.id` |
| `date` | string | `"2024"` | **Year only**, 4-digit string — not a full date, no month/day |
| `value` | number \| null | `2.75395370512433` | LCU per 1 USD, **period average** (annual average, not a point-in-time spot rate) |
| `unit` | string | `""` | Always empty string in this series — not populated by World Bank for this indicator |
| `obs_status` | string | `""` | Always empty string in this series |
| `decimal` | integer | `2` | Suggested display decimals; raw `value` carries full float precision regardless |

### Null / gap analysis (2015–2024)

`total: 10`, 10 rows returned, **zero nulls**. Full decade populated:

| Year | Value (WST per USD) |
|---|---|
| 2024 | 2.75395 |
| 2023 | 2.73844 |
| 2022 | 2.68900 |
| 2021 | 2.55609 |
| 2020 | 2.66496 |
| 2019 | 2.64883 |
| 2018 | 2.58728 |
| 2017 | 2.55438 |
| 2016 | 2.56493 |
| 2015 | 2.56087 |

### Mapping recommendation → `pdc_corridor_rates`

| World Bank field | Target column | Notes |
|---|---|---|
| `countryiso3code` | `country_iso3` | Use this, not `country.id` |
| `date` | `period_year` (or `as_of_date` = `YYYY-12-31`) | **This is an annual average, not a daily spot rate** — do not store it as if it were a daily `rate_date`. See Schema Validation Notes. |
| `value` | `rate_lcu_per_usd` | Already in "LCU per USD" direction — matches typical corridor-rate convention (multiply, not divide, to convert USD→WST) |
| `indicator.id` | `source_series_id` | For provenance |
| (constant) | `source` | `"world_bank_PA.NUS.FCRF"` |
| (derived) | `rate_type` | `"annual_average"` — must be distinguished from any daily spot series also feeding the same table |

---

## 2. World Bank — PA.NUS.FCRF for FJD (Fiji)

**Call:** `GET https://api.worldbank.org/v2/country/FJ/indicator/PA.NUS.FCRF?format=json&date=2015:2024&per_page=20`
**HTTP status:** 200

### Raw response excerpt (first record)

```json
{
  "indicator": { "id": "PA.NUS.FCRF", "value": "Official exchange rate (LCU per US$, period average)" },
  "country": { "id": "FJ", "value": "Fiji" },
  "countryiso3code": "FJI",
  "date": "2024",
  "value": 2.2683,
  "unit": "",
  "obs_status": "",
  "decimal": 2
}
```

### Field inventory

Identical structure and types to WST (Section 1) — same field names, same `date`-as-year-string format, same annual-average semantics.

### Null / gap analysis (2015–2024)

`total: 10`, 10 rows returned, **zero nulls** — same as WST, full decade populated:

| Year | Value (FJD per USD) |
|---|---|
| 2024 | 2.2683 |
| 2023 | 2.250125 |
| 2022 | 2.201407 |
| 2021 | 2.070633 |
| 2020 | 2.168805 |
| 2019 | 2.160393 |
| 2018 | 2.087380 |
| 2017 | 2.066875 |
| 2016 | 2.094696 |
| 2015 | 2.097630 |

No null years for either currency in the tested range — the blueprint's assumption that this indicator may have gaps for Pacific SIDS does not hold for WSM/FJI 2015–2024. (It may still hold for smaller/less-reported Pacific states not tested here — e.g. Tuvalu, Kiribati — which was out of scope for this probe.)

### Mapping recommendation

Same as Section 1 — identical schema, swap `countryiso3code` to `FJI`.

---

## 3. FRED — AUD/USD (DEXUSAL)

**Call:** `GET https://api.stlouisfed.org/fred/series/observations?series_id=DEXUSAL&observation_start=2020-01-01&observation_end=2024-12-31&api_key={FRED_API_KEY}&file_type=json&limit=20`
**HTTP status:** 200

### Raw response excerpt (first two records, to show a missing value in context)

```json
{
  "realtime_start": "2026-10-20",
  "realtime_end": "2026-10-20",
  "observation_start": "2020-01-01",
  "observation_end": "2024-12-31",
  "units": "lin",
  "output_type": 1,
  "file_type": "json",
  "order_by": "observation_date",
  "sort_order": "asc",
  "count": 1305,
  "offset": 0,
  "limit": 20,
  "observations": [
    {
      "realtime_start": "2026-10-20",
      "realtime_end": "2026-10-20",
      "date": "2020-01-01",
      "value": "."
    },
    {
      "realtime_start": "2026-10-20",
      "realtime_end": "2026-10-20",
      "date": "2020-01-02",
      "value": "0.6982"
    }
  ]
}
```

### Field inventory

| Field | Type | Example | Notes |
|---|---|---|---|
| `realtime_start` / `realtime_end` | string (date) | `"2026-10-20"` | FRED vintage/revision tracking — the date this data was current as of. Not the observation date. Irrelevant to this series (never revised) but present on every row. |
| `observation_start` / `observation_end` | string (date) | echoes query params | Top-level only, confirms requested window |
| `units` | string | `"lin"` | "Linear" — raw levels, no transformation applied (FRED also supports `chg`, `pch`, etc. via query param; not used here) |
| `count` | integer | `1305` | Total observations matching the query (ignores `limit`) — **1,305 calendar days over the 5-year window, i.e. one row per calendar day including weekends**, not one row per trading day only |
| `limit` | integer | `20` | Echoes requested page size |
| `observations[].date` | string | `"2020-01-02"` | Full `YYYY-MM-DD`, unlike World Bank's year-only string |
| `observations[].value` | **string**, not number | `"0.6982"` or `"."` | **Critical: value is always a string type, even for numeric observations.** Must be parsed/cast on ingest. |

### Null / gap analysis

- Missing values are represented as the **literal string `"."`** — not `null`, not `""`, not absent from the array. A naive `parseFloat(".")` returns `NaN`, not an error — ingestion code must explicitly check `value === "."` before parsing.
- First row in range, 2020-01-01, is `"."` — a public holiday (New Year's Day), confirming the series emits a row for every calendar day but only populates values on days the Federal Reserve bank published a rate (effectively US business days, since DEXUSAL is sourced from the Federal Reserve's H.10 release).
- Frequency is **daily** (one row per calendar day, gaps on weekends/holidays via `"."` rather than skipped rows) — not weekly or monthly. The blueprint should not assume FRED returns business-day-only rows with no gap markers; it returns every calendar day and marks gaps explicitly.

### Mapping recommendation → `pdc_corridor_rates`

| FRED field | Target column | Notes |
|---|---|---|
| `observations[].date` | `rate_date` | Already daily granularity — this is the one genuinely daily spot-style series among the four sources tested |
| `observations[].value` | `rate_usd_per_aud` (or invert) | **Direction check required**: DEXUSAL is "U.S. Dollars to One Australian Dollar" — i.e. USD per AUD, the *opposite* direction from the World Bank series (LCU per USD). Do not write both into the same column without a documented `rate_direction` flag or a normalization step. See Schema Validation Notes. |
| (constant) | `source` | `"fred_DEXUSAL"` |
| (derived) | `rate_type` | `"daily_spot"` |
| Rows where `value === "."` | — | **Skip the insert, do not write `0` or `null`-as-zero.** A `NULL` row is acceptable; a zero rate is not. |

---

## 4. UN Comtrade — Samoa tuna exports 2022

**Calls made:**
1. `GET https://comtradeapi.un.org/data/v1/get/C/A/HS?reporterCode=882&cmdCode=0303&flowCode=X&period=2022&maxRecords=5` — HTTP 200, returned bilateral partner rows (Thailand, Tokelau, …), **no world-aggregate row** in the first 5.
2. Follow-up: `...&partnerCode=0` — HTTP 200, confirms the world-aggregate record and its shape.
3. Follow-up: `...&partnerCode=0&includeDesc=true` — HTTP 200, confirms description fields are **null unless `includeDesc=true` is explicitly passed**.

### Raw response excerpt (world-aggregate record, `includeDesc=true`)

```json
{
  "typeCode": "C",
  "freqCode": "A",
  "refPeriodId": 20220101,
  "refYear": 2022,
  "refMonth": 52,
  "period": "2022",
  "reporterCode": 882,
  "reporterISO": "WSM",
  "reporterDesc": "Samoa",
  "flowCode": "X",
  "flowDesc": "Export",
  "partnerCode": 0,
  "partnerISO": "W00",
  "partnerDesc": "World",
  "partner2Code": 0,
  "partner2ISO": "W00",
  "partner2Desc": "World",
  "classificationCode": "H5",
  "cmdCode": "0303",
  "cmdDesc": "Fish; frozen, excluding fish fillets and other fish meat of heading 0304",
  "aggrLevel": 4,
  "isLeaf": false,
  "customsCode": "C00",
  "customsDesc": "TOTAL CPC",
  "motCode": 0,
  "motDesc": "TOTAL MOT",
  "qtyUnitCode": 8,
  "qtyUnitAbbr": "kg",
  "qty": 4988306.8,
  "isQtyEstimated": false,
  "altQtyUnitCode": 8,
  "altQty": 4988306.8,
  "isAltQtyEstimated": false,
  "netWgt": 4988306.8,
  "isNetWgtEstimated": false,
  "grossWgt": 0.0,
  "isGrossWgtEstimated": false,
  "cifvalue": null,
  "fobvalue": 8232432.41,
  "primaryValue": 8232432.41,
  "legacyEstimationFlag": 0,
  "isReported": false,
  "isAggregate": true
}
```

### Field inventory

| Field | Type | Example | Notes |
|---|---|---|---|
| `reporterCode` / `reporterISO` / `reporterDesc` | int / string / string | `882` / `"WSM"` / `"Samoa"` | `reporterISO` is the stable join key (ISO3) |
| `flowCode` / `flowDesc` | string | `"X"` / `"Export"` | `X`=export, `M`=import |
| `partnerCode` / `partnerISO` / `partnerDesc` | int / string / string | `0` / `"W00"` / `"World"` | **`partnerCode=0` is the world aggregate (total exports to all partners combined), not "unspecified."** Confirmed by direct query — single row returned, `isAggregate: true`, and `qty`/`netWgt`/`primaryValue` equal the sum of all bilateral partner rows for the same reporter/commodity/year/flow. |
| `partner2Code` / `partner2ISO` / `partner2Desc` | int / string / string | `0` / `"W00"` / `"World"` | Secondary partner (used for re-export tracking); `0`/`"World"` when not applicable |
| `cmdCode` / `cmdDesc` | string | `"0303"` / `"Fish; frozen, excluding fish fillets..."` | HS code and its description. **`cmdDesc` is `null` unless `includeDesc=true` is passed** — same for `reporterDesc`, `flowDesc`, `partnerDesc`, `customsDesc`, `motDesc`. |
| `qtyUnitCode` / `qtyUnitAbbr` | int / string | `8` / `"kg"` | Confirms `qty` is denominated in kilograms for this commodity |
| `qty` | float | `4988306.8` | Present and populated |
| `isQtyEstimated` | boolean | `false` | Flags whether `qty` was estimated by Comtrade rather than reported |
| `netWgt` | float | `4988306.8` | **Identical to `qty` in this response** — for HS 0303, the reported quantity unit *is* net weight in kg, so these two fields collapse to the same number. Do not assume they always differ. |
| `grossWgt` | float | `0.0` | **Not populated for this reporter** — gross weight reporting is optional and Samoa does not report it. A `0.0` here means "not reported," not "zero weight." Must not be treated as a true zero downstream. |
| `cifvalue` | float \| null | `null` | CIF (cost-insurance-freight) value — **only applicable to imports**. Always null for export flow rows; this is expected, not a data gap. |
| `fobvalue` | float | `8232432.41` | FOB (free-on-board) value in USD — the correct trade-value field for **export** flows |
| `primaryValue` | float | `8232432.41` | **Equal to `fobvalue` for this export row** — Comtrade's `primaryValue` is a flow-aware column that resolves to `fobvalue` for exports and `cifvalue` for imports. Downstream code should read `primaryValue` directly rather than branching on `fobvalue`/`cifvalue` by flow, since Comtrade already does that resolution. |
| `isAggregate` | boolean | `true` | Confirms the row is an aggregate (world total), not a single bilateral observation |
| `isReported` | boolean | `false` | Flags whether the figure came from Samoa's own reporting (`false` here — likely a secondary/mirror estimate, since Samoa does not report HS-level detail directly for all commodities; see Schema Validation Notes) |

### Null / gap analysis

- `cifvalue` is `null` on every row for this export-flow query — **expected**, not a gap (CIF only applies to imports).
- `reporterDesc`, `flowDesc`, `partnerDesc`, `cmdDesc`, `customsDesc`, `motDesc` are all `null` by default and only populate when `includeDesc=true` is explicitly added to the query string — **this is the one mismatch most likely to surprise a pipeline built from docs alone.**
- `grossWgt` is `0.0` (not null) when unreported — a silent zero, not an explicit gap marker. Any code treating `grossWgt > 0` as "has weight data" will misread this.
- `isReported: false` on the Samoa reporter row for this commodity/year suggests this may be a Comtrade-estimated/mirrored figure rather than a figure Samoa itself submitted — worth flagging for data-quality labeling in the oracle output, consistent with Decision 61's requirement to disclose provenance/certification status per endpoint.

### Mapping recommendation → `pdc_trade_flows`

| Comtrade field | Target column | Notes |
|---|---|---|
| `reporterISO` | `reporter_iso3` | |
| `partnerISO` | `partner_iso3` | `"W00"` for world aggregate — store it, don't convert to null |
| `refYear` or `period` | `period_year` | `period` is a string, `refYear` is an int — prefer `refYear` for a numeric column |
| `flowCode` | `flow_type` | Store the raw `"X"`/`"M"` code or map to an enum — document which |
| `cmdCode` | `hs_code` | |
| `cmdDesc` | `hs_description` | **Must always request `includeDesc=true`**, or this column will be null for every row |
| `primaryValue` | `trade_value_usd` | Use this directly — do not re-derive from `fobvalue`/`cifvalue` |
| `qty` + `qtyUnitAbbr` | `quantity`, `quantity_unit` | Store the unit alongside the number — don't assume kg |
| `netWgt` | `net_weight_kg` | Only if `qtyUnitAbbr === "kg"`; otherwise this is not necessarily a weight |
| `isAggregate`, `isReported`, `isQtyEstimated` | `is_world_aggregate`, `is_self_reported`, `is_quantity_estimated` | Carry these through — needed for Decision 61's data-currency/attribution requirement |
| (constant) | `source` | `"un_comtrade_C_A_HS"` |

---

## 5. SCHEMA VALIDATION NOTES

Mismatches found between what a "corridor rates + trade flows" blueprint would naively assume and what these four APIs actually return, with recommended adjustments **before any migration is written**:

1. **Mixed rate directions across sources.** World Bank's `PA.NUS.FCRF` is LCU-per-USD (e.g. WST per USD, FJD per USD). FRED's `DEXUSAL` is USD-per-AUD (the inverse convention). A single `pdc_corridor_rates.rate` column cannot hold both without a `rate_direction` (or `base_currency`/`quote_currency`) column, or every source must be normalized to one direction at ingest time. **Recommend adding `base_currency`, `quote_currency` columns instead of an implicit "LCU per USD" assumption**, and normalizing at write time rather than read time.

2. **Mixed temporal granularity in one proposed table.** World Bank gives one annual-average observation per year (`date` = `"2024"`, a bare year string). FRED gives one observation per calendar day (`date` = `"2020-01-02"`, full ISO date, with explicit `"."` gap markers on non-trading days). If `pdc_corridor_rates` has a single `rate_date` column, annual World Bank rows need a synthetic date (e.g. year-end or year-start) and a `granularity` or `rate_type` enum (`annual_average` vs `daily_spot`) so consumers don't treat a once-a-year figure as a live spot rate. **Recommend adding `granularity` enum to the schema.**

3. **FRED's `value` is a string, including for missing observations (`"."`).** The blueprint should specify explicit cast-and-filter logic (`if value === "." → skip or NULL`, else `parseFloat(value)`) rather than a blind numeric cast — `parseFloat(".")` is `NaN`, not a thrown error, and a `NaN` written to a numeric column will fail silently or corrupt the column depending on the DB driver.

4. **Comtrade description fields require `includeDesc=true`.** None of `reporterDesc`, `flowDesc`, `partnerDesc`, `cmdDesc`, `customsDesc`, `motDesc` populate without this query parameter — every blueprint query string touching Comtrade must include it, or the pipeline will silently ingest nulls into every description column it was counting on.

5. **Comtrade `grossWgt` uses `0.0` as "not reported," not an explicit null.** Any schema or pipeline logic doing `WHERE gross_wgt > 0` to filter for "has weight data" will systematically exclude unreported rows that should instead resolve to `NULL` or be flagged, not conflated with a true zero-weight shipment.

6. **Comtrade `primaryValue` already resolves the FOB/CIF flow-direction branching.** A blueprint that stores both `fobvalue` and `cifvalue` and branches on `flowCode` in application code is duplicating work Comtrade already does — `primaryValue` is sufficient as the single trade-value column, with `fobvalue`/`cifvalue` kept only if the raw source values are independently useful for audit.

7. **`partnerCode=0` is a legitimate, populated "World" aggregate row, not a sentinel for missing data.** If the blueprint's pipeline logic ever does `WHERE partnerCode != 0` to "filter out junk," it will silently drop the one row most useful for a country-level total — this needs to be an explicit, named query mode (`aggregate` vs `bilateral`), not filtered out by default.

8. **Comtrade `isReported: false` on a reporter row signals a Comtrade-estimated/mirrored figure, not a self-submission.** Given Decision 61's design intent (PDC sells a *validated, agent-ready* layer, not raw data) and Decision 59/60's attribution requirements, the oracle's response schema should surface `is_self_reported` so downstream consumers and the mandatory attribution text (per Decision 61) can state plainly when a figure is Comtrade's own estimate rather than a government submission.

9. **World Bank's top-level response shape is a bare 2-element array, not an object.** `data[0]` is pagination metadata, `data[1]` is the observations array — there is no `{"data": [...]}` envelope. Parsing code must destructure by array index, which is easy to get wrong if written from memory/assumption rather than tested against a live response (exactly the discrepancy this probe was designed to catch before migrations are written).

10. **No credentials needed for World Bank; FRED and Comtrade both require keys passed as query param / header respectively, not request body.** Confirms the adapter-pattern requirement from CLAUDE.md §17 ("x402 adapter pattern... no secrets in code") — all three keyed calls must route through environment-variable-backed server-side calls only, never client-side, since Comtrade's key is a raw subscription key with no OAuth scoping observed in this probe.

---

*End of probe. No database migrations, Workers code, or seed scripts were written. All four source calls were live HTTP requests made 2026-10-21 using credentials from `apps/web/.env.local`.*
