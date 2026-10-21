#!/usr/bin/env python3
"""
fred_seed.py — Pacific FX Oracle historical seed (FRED only)

Fetches DEXUSAL (USD/AUD) and DEXUSNZ (USD/NZD) daily series from the St
Louis Fed, inverts each to AUD/USD and NZD/USD to match the World Bank
LCU-per-USD convention already used by pdc_corridor_rates, and upserts into
pdc_corridor_rates. No World Bank, no Comtrade, no currency seeding — AUD
and NZD rows already exist in pdc_currencies from world_bank_seed.py.

Series note: the build spec named series 2 as AEXUSNZ, which is FRED's
*annual* NZD/USD series (~55 observations total, frequency=Annual) — not a
daily series. DEXUSNZ is the daily equivalent of DEXUSAL (same title,
frequency=Daily), confirmed live against the FRED /series metadata endpoint
and confirmed with the user. Used here in place of AEXUSNZ.

Parsing follows docs/intelligence/oracle-api-structure-probe-2026-10-21.md
finding 3 / probe section 3: FRED's "value" is always a string, including
the literal "." for missing observations (weekends/holidays) — never a
float, and never absent from the array.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import requests
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Environment — apps/web/.env.local
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / "apps" / "web" / ".env.local"


def load_env_file(path: Path) -> dict:
    if not path.exists():
        print(f"ERROR: env file not found at {path}", file=sys.stderr)
        sys.exit(1)
    env = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def require_env(env: dict, *names: str) -> str:
    for name in names:
        value = env.get(name)
        if value:
            return value
    print(f"ERROR: none of {names} found in {ENV_FILE}", file=sys.stderr)
    sys.exit(1)


_env = load_env_file(ENV_FILE)
SUPABASE_URL = require_env(_env, "NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = require_env(_env, "SUPABASE_SERVICE_KEY")
FRED_API_KEY = require_env(_env, "FRED_API_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ---------------------------------------------------------------------------
# Series configuration
# ---------------------------------------------------------------------------

FRED_URL = "https://api.stlouisfed.org/fred/series/observations"
OBSERVATION_START = "1990-01-01"
OBSERVATION_END = "2024-12-31"
INSERT_BATCH_SIZE = 200

SERIES = [
    {
        "series_id": "DEXUSAL",
        "iso_code": "AUD",
        "base_currency": "AUD",
        "source_series_id": "FRED_DEXUSAL",
        "source_attribution": "Federal Reserve Bank of St. Louis (FRED) — DEXUSAL (CC0)",
        "methodology_notes": (
            "Daily spot rate USD/AUD, inverted at ingest to AUD per USD "
            "to match World Bank LCU-per-USD convention."
        ),
    },
    {
        "series_id": "DEXUSNZ",
        "iso_code": "NZD",
        "base_currency": "NZD",
        "source_series_id": "FRED_DEXUSNZ",
        "source_attribution": "Federal Reserve Bank of St. Louis (FRED) — DEXUSNZ (CC0)",
        "methodology_notes": (
            "Daily spot rate USD/NZD, inverted at ingest to NZD per USD "
            "to match World Bank LCU-per-USD convention."
        ),
    },
]


def fetch_fred_series(series_id: str) -> list:
    resp = requests.get(
        FRED_URL,
        params={
            "series_id": series_id,
            "api_key": FRED_API_KEY,
            "file_type": "json",
            "observation_start": OBSERVATION_START,
            "observation_end": OBSERVATION_END,
        },
        timeout=60,
    )
    if resp.status_code != 200:
        print(f"HTTP ERROR fetching {series_id}: status={resp.status_code}", file=sys.stderr)
        print(f"Response body: {resp.text}", file=sys.stderr)
        sys.exit(1)

    payload = resp.json()
    observations = payload.get("observations")
    if observations is None:
        print(f"HTTP ERROR fetching {series_id}: no 'observations' key in response", file=sys.stderr)
        print(f"Response body: {resp.text}", file=sys.stderr)
        sys.exit(1)

    count = payload.get("count")
    if isinstance(count, int) and count > len(observations):
        print(f"WARNING: {series_id} reports count={count} but only "
              f"{len(observations)} rows returned in this page — "
              f"a higher 'limit' or pagination may be needed.", file=sys.stderr)
    return observations


def get_currency_id(iso_code: str) -> str:
    result = (
        supabase.table("pdc_currencies")
        .select("id")
        .eq("iso_code", iso_code)
        .limit(1)
        .execute()
    )
    if not result.data:
        print(f"SUPABASE WRITE ERROR: no pdc_currencies row for iso_code={iso_code} "
              f"(run world_bank_seed.py first — it seeds AUD/NZD into pdc_currencies)",
              file=sys.stderr)
        sys.exit(1)
    return result.data[0]["id"]


def existing_period_dates(currency_id: str, source_series_id: str) -> set:
    # pdc_corridor_rates has no unique constraint on (currency_id, period_date,
    # source_series_id) — migration 05 only created plain indexes — so a real
    # upsert(on_conflict=...) isn't possible. world_bank_seed.py checked
    # existence per row (fine at ~35 rows/currency); at ~9,000 rows/series here
    # that would mean ~9,000 sequential SELECT round trips per series. Instead,
    # every already-inserted date for this (currency_id, source_series_id)
    # pair is fetched once (paginated by PostgREST's row cap) and existence is
    # checked in memory before each insert — same idempotency guarantee
    # ("never insert a duplicate"), far fewer round trips.
    dates = set()
    page_size = 1000
    start = 0
    while True:
        result = (
            supabase.table("pdc_corridor_rates")
            .select("period_date")
            .eq("currency_id", currency_id)
            .eq("source_series_id", source_series_id)
            .range(start, start + page_size - 1)
            .execute()
        )
        rows = result.data or []
        dates.update(row["period_date"] for row in rows)
        if len(rows) < page_size:
            break
        start += page_size
    return dates


def insert_batch(rows: list) -> None:
    try:
        supabase.table("pdc_corridor_rates").insert(rows).execute()
    except Exception as exc:
        print(f"SUPABASE WRITE ERROR (pdc_corridor_rates batch insert): {exc}", file=sys.stderr)
        print(f"Batch: {json.dumps(rows, default=str)}", file=sys.stderr)
        sys.exit(1)


def seed_series(series_cfg: dict) -> int:
    series_id = series_cfg["series_id"]
    iso_code = series_cfg["iso_code"]

    print(f"Fetching {series_id} from FRED...")
    observations = fetch_fred_series(series_id)
    currency_id = get_currency_id(iso_code)
    already_seen = existing_period_dates(currency_id, series_cfg["source_series_id"])

    missing_skipped = 0
    rows = []
    for obs in observations:
        value = obs.get("value")
        if value == ".":
            missing_skipped += 1
            continue
        period_date = obs["date"]
        if period_date in already_seen:
            continue
        rate_value = round(1.0 / float(value), 10)
        rows.append({
            "currency_id": currency_id,
            "base_currency": series_cfg["base_currency"],
            "quote_currency": "USD",
            "period_date": period_date,
            "granularity": "daily_spot",
            "rate_value": rate_value,
            "data_type": "sourced",
            "source_attribution": series_cfg["source_attribution"],
            "source_series_id": series_cfg["source_series_id"],
            "methodology_notes": series_cfg["methodology_notes"],
            "is_verified": True,
            "is_superseded": False,
            "oracle_version": "v1.0",
        })

    print(f"{series_id}: {len(observations)} observations returned, {missing_skipped} missing skipped")

    already_existed = len(observations) - missing_skipped - len(rows)
    inserted = 0
    for i in range(0, len(rows), INSERT_BATCH_SIZE):
        batch = rows[i:i + INSERT_BATCH_SIZE]
        insert_batch(batch)
        inserted += len(batch)

    print(f"{iso_code}: {inserted} rows inserted ({already_existed} already existed)")
    return inserted


def main() -> None:
    totals = {}
    for series_cfg in SERIES:
        totals[series_cfg["iso_code"]] = seed_series(series_cfg)

    total = sum(totals.values())
    parts = " | ".join(f"{iso}: {count} rows" for iso, count in totals.items())
    print(f"Seed complete. {parts} | Total: {total} rows")


if __name__ == "__main__":
    main()
