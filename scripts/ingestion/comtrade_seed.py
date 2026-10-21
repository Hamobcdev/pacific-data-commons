#!/usr/bin/env python3
"""
comtrade_seed.py — Pacific FX Oracle trade flow seed (UN Comtrade only)

Fetches annual export/import trade flow data (world aggregate, partnerCode=0)
for 6 Pacific reporter countries, 2010-2023, and upserts into pdc_trade_flows.
No other tables. AUS/NZL are trade partners in context, not fetched as
reporters here.

Parsing follows docs/intelligence/oracle-api-structure-probe-2026-10-21.md
section 4: Comtrade's response DOES have a {"data": [...]} envelope (unlike
World Bank's bare array); grossWgt of 0.0 (or already-None) means "not
reported" and is stored as NULL, never 0; partnerCode=0 / partnerISO="W00"
is a valid world-aggregate row, not junk; primaryValue is the correct trade
value field (Comtrade already resolves FOB/CIF by flow direction);
isReported=false means a Comtrade secondary estimate; includeDesc=true is
required for the commodity description field to populate.

partner2Code=0 must also be requested explicitly. Without it, Comtrade's
partnerCode=0 ("world") query still returns one extra row per hs_code for
every secondary/re-export partner it has data for (partner2Code breakdown
e.g. ASM, AUS, CHN...), alongside the true partner2Code=0 world-total row.
This breakdown is absent for some reporter/year/flow combinations and
present for others (observed: WSM imports jump from ~4000 to ~20000 rows
starting 2018) — so it surfaces unpredictably and caused a prior run to
crash with "ON CONFLICT DO UPDATE command cannot affect row a second time"
when two rows for the same hs_code landed in one upsert batch. Discovered
2026-10-21 debugging a stalled/crashed seed run.

motCode (mode of transport) must also be requested explicitly as 0 for the
same reason as partner2Code above. Without it, some reporter/year/flow
combinations return an extra breakdown row per hs_code split by transport
mode (observed: SLB X 2011, hs_code=3209 — one row motCode=0 "TOTAL MOT",
one row motCode=9900 "Other" — both partner2ISO=W00, so the partner2Code
guard above didn't catch it). Same crash signature: "duplicate hs_code"
from build_rows(). Discovered 2026-10-21 on the SLB/VUT completion rerun.
"""

from __future__ import annotations

import json
import sys
import time
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
COMTRADE_API_KEY = require_env(_env, "COMTRADE_API_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ---------------------------------------------------------------------------
# Comtrade fetch + pdc_trade_flows seed
# ---------------------------------------------------------------------------

COMTRADE_URL = "https://comtradeapi.un.org/data/v1/get/C/A/HS"
COMTRADE_HEADERS = {"Ocp-Apim-Subscription-Key": COMTRADE_API_KEY}

# Reporter ISO3 -> UN numeric reporter code. AUS (36) and NZL (554) are
# trade partners in this corridor's context, not reporters — not fetched.
REPORTERS = {
    "WSM": 882,  # Samoa
    "FJI": 242,  # Fiji
    "TON": 776,  # Tonga
    "PNG": 598,  # Papua New Guinea
    "SLB": 90,   # Solomon Islands
    "VUT": 548,  # Vanuatu
}

YEARS = range(2010, 2024)  # 2010-2023 inclusive
FLOWS = ["X", "M"]
INSERT_BATCH_SIZE = 100
SLEEP_BETWEEN_CALLS = 1
SOURCE = "un_comtrade_C_A_HS"


def fetch_comtrade(reporter_code: int, year: int, flow_code: str) -> list | None:
    params = {
        "reporterCode": reporter_code,
        "period": year,
        "flowCode": flow_code,
        "partnerCode": 0,
        "partner2Code": 0,
        "motCode": 0,
        "includeDesc": "true",
    }
    label = f"reporterCode={reporter_code} period={year} flowCode={flow_code}"

    for attempt in (1, 2):
        resp = requests.get(COMTRADE_URL, params=params, headers=COMTRADE_HEADERS, timeout=60)

        if resp.status_code == 429:
            if attempt == 1:
                print(f"RATE LIMIT ({label}) — sleeping 60s and retrying once", file=sys.stderr)
                time.sleep(60)
                continue
            print(f"HTTP ERROR ({label}): status=429 after retry", file=sys.stderr)
            print(f"Response body: {resp.text}", file=sys.stderr)
            return None

        if resp.status_code != 200:
            print(f"HTTP ERROR ({label}): status={resp.status_code}", file=sys.stderr)
            print(f"Response body: {resp.text}", file=sys.stderr)
            return None

        payload = resp.json()
        # Comtrade DOES have a {"data": [...]} envelope — unlike World Bank's bare array.
        data = payload.get("data")
        if data is None:
            print(f"HTTP ERROR ({label}): no 'data' key in response", file=sys.stderr)
            print(f"Response body: {resp.text}", file=sys.stderr)
            return None
        return data

    return None


def build_rows(data: list, reporter_iso3: str, flow_type: str) -> tuple[list, int]:
    rows = []
    skipped_zero = 0
    seen_keys: dict[str, dict] = {}
    for row in data:
        value = row.get("primaryValue")
        if value is None or value == 0:
            skipped_zero += 1
            continue

        # partner2Code=0 is requested explicitly (see module docstring), so
        # every row here should already be the pure world total per hs_code.
        # If Comtrade ever returns a second breakdown dimension anyway, fail
        # loudly rather than let ON CONFLICT crash mid-batch or silently keep
        # whichever duplicate happened to upsert last.
        partner2 = row.get("partner2ISO", "W00")
        if partner2 != "W00":
            print(
                f"DATA ERROR: unexpected partner2ISO={partner2!r} for "
                f"hs_code={row.get('cmdCode')} reporter={reporter_iso3} "
                f"period={row.get('period')} flow={flow_type} — expected "
                f"only partner2Code=0 (W00) rows with partner2Code=0 requested",
                file=sys.stderr,
            )
            sys.exit(1)

        gross_wgt = row.get("grossWgt")
        net_weight_kg = None if gross_wgt == 0.0 else gross_wgt

        hs_code = str(row["cmdCode"])
        if hs_code in seen_keys:
            print(
                f"DATA ERROR: duplicate hs_code={hs_code} for reporter={reporter_iso3} "
                f"period={row.get('period')} flow={flow_type} — would collide on the "
                f"pdc_trade_flows unique constraint within one upsert batch",
                file=sys.stderr,
            )
            print(f"First row: {json.dumps(seen_keys[hs_code], default=str)}", file=sys.stderr)
            print(f"Second row: {json.dumps(row, default=str)}", file=sys.stderr)
            sys.exit(1)
        seen_keys[hs_code] = row

        rows.append({
            "period_year": int(row["period"]),
            "reporter_iso3": reporter_iso3,
            "partner_iso3": row.get("partnerISO", "W00"),
            "flow_type": flow_type,
            "hs_code": hs_code,
            "hs_description": row.get("cmdDesc"),
            "trade_value_usd": value,
            "quantity": row.get("qty"),
            "quantity_unit": row.get("qtyUnitAbbr"),
            "net_weight_kg": net_weight_kg,
            "is_world_aggregate": True,
            "is_self_reported": not row.get("isReported", True),
            "is_quantity_estimated": bool(row.get("isQtyEstimated", False)),
            "source": SOURCE,
        })
    return rows, skipped_zero


def upsert_batches(rows: list, label: str) -> int:
    inserted = 0
    for i in range(0, len(rows), INSERT_BATCH_SIZE):
        batch = rows[i:i + INSERT_BATCH_SIZE]
        try:
            supabase.table("pdc_trade_flows").upsert(
                batch,
                on_conflict="period_year,reporter_iso3,partner_iso3,flow_type,hs_code",
            ).execute()
        except Exception as exc:
            print(f"SUPABASE WRITE ERROR (pdc_trade_flows upsert) for {label}: {exc}", file=sys.stderr)
            print(f"Batch: {json.dumps(batch, default=str)}", file=sys.stderr)
            sys.exit(1)
        inserted += len(batch)
    return inserted


def seed_reporter_year_flow(reporter_iso3: str, reporter_code: int, year: int, flow_code: str) -> int:
    direction = "exports" if flow_code == "X" else "imports"
    print(f"Fetching {reporter_iso3} {direction} {year}...")

    data = fetch_comtrade(reporter_code, year, flow_code)
    time.sleep(SLEEP_BETWEEN_CALLS)

    if data is None:
        return 0

    rows, skipped_zero = build_rows(data, reporter_iso3, flow_code)
    print(f"{reporter_iso3} {flow_code} {year}: {len(data)} rows, {skipped_zero} skipped (zero value)")

    if not rows:
        print(f"{reporter_iso3} {flow_code} {year}: 0 rows upserted")
        return 0

    label = f"{reporter_iso3} {flow_code} {year}"
    inserted = upsert_batches(rows, label)
    print(f"{reporter_iso3} {flow_code} {year}: {inserted} rows upserted")
    return inserted


def main() -> None:
    total_upserted = 0
    for reporter_iso3, reporter_code in REPORTERS.items():
        for year in YEARS:
            for flow_code in FLOWS:
                total_upserted += seed_reporter_year_flow(reporter_iso3, reporter_code, year, flow_code)

    print(f"Seed complete. Total rows upserted: {total_upserted}")


if __name__ == "__main__":
    main()
