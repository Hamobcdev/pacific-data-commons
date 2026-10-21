#!/usr/bin/env python3
"""
world_bank_seed.py — Pacific FX Oracle historical seed (World Bank only)

Seeds pdc_currencies (14 anchor/regional/comparative currency records), then
fetches PA.NUS.FCRF (1990-2024) for the 6 Pacific currencies and upserts the
observations into pdc_corridor_rates. No FRED, no Comtrade, no other tables.

Parsing follows docs/intelligence/oracle-api-structure-probe-2026-10-21.md
finding 9: the World Bank response is a bare 2-element array — [0] metadata,
[1] observations — not a {"data": [...]} envelope.
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
# Spec names this SUPABASE_SERVICE_ROLE_KEY; apps/web/.env.local actually
# defines it as SUPABASE_SERVICE_KEY. Accept either name.
SUPABASE_SERVICE_KEY = require_env(_env, "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ---------------------------------------------------------------------------
# Part 1 — pdc_currencies seed data
# ---------------------------------------------------------------------------

CURRENCIES = [
    # Tier 1 — anchor
    {"iso_code": "USD", "currency_name": "US Dollar", "country_name": "United States",
     "country_iso2": "US", "country_iso3": "USA", "currency_tier": 1, "currency_type": "ANCHOR",
     "basket_composition": None},
    {"iso_code": "NZD", "currency_name": "New Zealand Dollar", "country_name": "New Zealand",
     "country_iso2": "NZ", "country_iso3": "NZL", "currency_tier": 1, "currency_type": "ANCHOR",
     "basket_composition": None},
    {"iso_code": "AUD", "currency_name": "Australian Dollar", "country_name": "Australia",
     "country_iso2": "AU", "country_iso3": "AUS", "currency_tier": 1, "currency_type": "ANCHOR",
     "basket_composition": None},
    {"iso_code": "EUR", "currency_name": "Euro", "country_name": "European Union",
     "country_iso2": None, "country_iso3": None, "currency_tier": 1, "currency_type": "ANCHOR",
     "basket_composition": None},
    {"iso_code": "JPY", "currency_name": "Japanese Yen", "country_name": "Japan",
     "country_iso2": "JP", "country_iso3": "JPN", "currency_tier": 1, "currency_type": "ANCHOR",
     "basket_composition": None},
    {"iso_code": "CNY", "currency_name": "Chinese Yuan", "country_name": "China",
     "country_iso2": "CN", "country_iso3": "CHN", "currency_tier": 1, "currency_type": "ANCHOR",
     "basket_composition": None},
    {"iso_code": "SGD", "currency_name": "Singapore Dollar", "country_name": "Singapore",
     "country_iso2": "SG", "country_iso3": "SGP", "currency_tier": 1, "currency_type": "ANCHOR",
     "basket_composition": None},

    # Tier 2 — regional Pacific
    {"iso_code": "WST", "currency_name": "Samoan Tālā", "country_name": "Samoa",
     "country_iso2": "WS", "country_iso3": "WSM", "currency_tier": 2, "currency_type": "REGIONAL_PACIFIC",
     "monetary_independence_date": "1967-07-01",
     "basket_composition": {"USD": 0.45, "NZD": 0.30, "AUD": 0.15, "EUR": 0.07, "JPY": 0.03},
     "current_central_bank": "Central Bank of Samoa"},
    {"iso_code": "FJD", "currency_name": "Fijian Dollar", "country_name": "Fiji",
     "country_iso2": "FJ", "country_iso3": "FJI", "currency_tier": 2, "currency_type": "REGIONAL_PACIFIC",
     "monetary_independence_date": "1970-10-10",
     "basket_composition": None,
     "current_central_bank": "Reserve Bank of Fiji"},
    {"iso_code": "TOP", "currency_name": "Tongan Paʻanga", "country_name": "Tonga",
     "country_iso2": "TO", "country_iso3": "TON", "currency_tier": 2, "currency_type": "REGIONAL_PACIFIC",
     "monetary_independence_date": "1967-04-03",
     "basket_composition": {"USD": 0.45, "AUD": 0.30, "NZD": 0.15, "EUR": 0.075, "JPY": 0.025},
     "current_central_bank": "National Reserve Bank of Tonga"},
    {"iso_code": "PGK", "currency_name": "Papua New Guinea Kina", "country_name": "Papua New Guinea",
     "country_iso2": "PG", "country_iso3": "PNG", "currency_tier": 2, "currency_type": "REGIONAL_PACIFIC",
     "monetary_independence_date": "1975-09-16",
     "basket_composition": None,
     "current_central_bank": "Bank of Papua New Guinea"},
    {"iso_code": "SBD", "currency_name": "Solomon Islands Dollar", "country_name": "Solomon Islands",
     "country_iso2": "SB", "country_iso3": "SLB", "currency_tier": 2, "currency_type": "REGIONAL_PACIFIC",
     "monetary_independence_date": "1977-07-07",
     "basket_composition": None,
     "current_central_bank": "Central Bank of Solomon Islands"},
    {"iso_code": "VUV", "currency_name": "Vanuatu Vatu", "country_name": "Vanuatu",
     "country_iso2": "VU", "country_iso3": "VUT", "currency_tier": 2, "currency_type": "REGIONAL_PACIFIC",
     "monetary_independence_date": "1980-07-30",
     "basket_composition": {"USD": 0.45, "EUR": 0.30, "AUD": 0.25},
     "current_central_bank": "Reserve Bank of Vanuatu"},

    # Tier 4 — comparative RSE
    {"iso_code": "PHP", "currency_name": "Philippine Peso", "country_name": "Philippines",
     "country_iso2": "PH", "country_iso3": "PHL", "currency_tier": 4, "currency_type": "COMPARATIVE_RSE",
     "basket_composition": None,
     "current_central_bank": "Bangko Sentral ng Pilipinas",
     "notes": ("Comparative RSE reference. Philippines is outside Pacific Island region "
               "but has analogous large-scale managed labour migration and remittance "
               "dependency. Used as comparative basket, not Pacific anchor.")},
]


def seed_currencies() -> None:
    print(f"Seeding {len(CURRENCIES)} currency records into pdc_currencies...")
    try:
        supabase.table("pdc_currencies").upsert(CURRENCIES, on_conflict="iso_code").execute()
    except Exception as exc:
        print(f"SUPABASE WRITE ERROR (pdc_currencies upsert): {exc}", file=sys.stderr)
        print(f"Rows attempted: {json.dumps(CURRENCIES, default=str)}", file=sys.stderr)
        sys.exit(1)
    print(f"pdc_currencies: {len(CURRENCIES)} rows upserted.")


# ---------------------------------------------------------------------------
# Part 2 — World Bank fetch + pdc_corridor_rates seed
# ---------------------------------------------------------------------------

WORLD_BANK_URL = "https://api.worldbank.org/v2/country/{wb_code}/indicator/PA.NUS.FCRF"

# World Bank 2-letter country code -> pdc_currencies.iso_code
CURRENCY_MAP = {
    "WS": "WST",
    "FJ": "FJD",
    "TO": "TOP",
    "PG": "PGK",
    "SB": "SBD",
    "VU": "VUV",
}

SOURCE_SERIES_ID = "PA.NUS.FCRF"
SOURCE_ATTRIBUTION = "World Bank Open Data — PA.NUS.FCRF (CC BY 4.0)"
METHODOLOGY_NOTES = (
    "Official exchange rate, LCU per US dollar, period average. "
    "Annual average, not a spot rate."
)


def fetch_world_bank_series(wb_code: str) -> list:
    resp = requests.get(
        WORLD_BANK_URL.format(wb_code=wb_code),
        params={"format": "json", "date": "1990:2024", "per_page": 50},
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"HTTP ERROR fetching {wb_code}: status={resp.status_code}", file=sys.stderr)
        print(f"Response body: {resp.text}", file=sys.stderr)
        sys.exit(1)

    payload = resp.json()
    # Probe finding 9: bare 2-element array — [0]=metadata, [1]=observations.
    # No {"data": [...]} envelope. Parse by index only.
    if not isinstance(payload, list) or len(payload) != 2:
        print(f"HTTP ERROR fetching {wb_code}: unexpected response shape (not a 2-element array)", file=sys.stderr)
        print(f"Response body: {resp.text}", file=sys.stderr)
        sys.exit(1)

    metadata, observations = payload[0], payload[1] or []
    total = (metadata or {}).get("total", len(observations))
    if isinstance(total, int) and total > len(observations):
        print(f"WARNING: {wb_code} metadata reports total={total} but only "
              f"{len(observations)} rows returned — per_page may be too small.", file=sys.stderr)
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
              f"(currency seed must run before rate seed)", file=sys.stderr)
        sys.exit(1)
    return result.data[0]["id"]


def rate_row_exists(currency_id: str, period_date: str, granularity: str, source_series_id: str) -> bool:
    # pdc_corridor_rates has no unique constraint on (currency_id, period_date,
    # granularity, source_series_id) — migration 05 only created plain indexes.
    # A real upsert(on_conflict=...) would fail with "no unique or exclusion
    # constraint matching the ON CONFLICT specification", so idempotency is
    # enforced here via SELECT-then-insert-if-absent instead.
    result = (
        supabase.table("pdc_corridor_rates")
        .select("id")
        .eq("currency_id", currency_id)
        .eq("period_date", period_date)
        .eq("granularity", granularity)
        .eq("source_series_id", source_series_id)
        .limit(1)
        .execute()
    )
    return bool(result.data)


def seed_rates_for_currency(wb_code: str, iso_code: str) -> int:
    print(f"Fetching {iso_code} ({wb_code}) from World Bank...")
    observations = fetch_world_bank_series(wb_code)
    currency_id = get_currency_id(iso_code)

    null_skipped = 0
    rows = []
    for obs in observations:
        value = obs.get("value")
        if value is None:
            null_skipped += 1
            continue
        period_date = f"{obs['date']}-12-31"
        rows.append({
            "currency_id": currency_id,
            "base_currency": iso_code,
            "quote_currency": "USD",
            "period_date": period_date,
            "granularity": "annual_average",
            "rate_value": value,
            "data_type": "sourced",
            "source_attribution": SOURCE_ATTRIBUTION,
            "source_series_id": SOURCE_SERIES_ID,
            "methodology_notes": METHODOLOGY_NOTES,
            "is_verified": True,
            "is_superseded": False,
            "oracle_version": "v1.0",
        })

    print(f"{iso_code}: {len(observations)} rows returned, {null_skipped} nulls skipped")

    inserted = 0
    for row in rows:
        try:
            if rate_row_exists(row["currency_id"], row["period_date"], row["granularity"], row["source_series_id"]):
                continue
            supabase.table("pdc_corridor_rates").insert(row).execute()
            inserted += 1
        except Exception as exc:
            print(f"SUPABASE WRITE ERROR (pdc_corridor_rates insert) for {iso_code} {row['period_date']}: {exc}",
                  file=sys.stderr)
            print(f"Row: {json.dumps(row, default=str)}", file=sys.stderr)
            sys.exit(1)

    print(f"{iso_code}: {inserted} rows upserted to pdc_corridor_rates")
    return inserted


def main() -> None:
    seed_currencies()

    total_inserted = 0
    for wb_code, iso_code in CURRENCY_MAP.items():
        total_inserted += seed_rates_for_currency(wb_code, iso_code)

    print(f"Seed complete. Total rows upserted: {total_inserted}")


if __name__ == "__main__":
    main()
