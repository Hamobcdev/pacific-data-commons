#!/usr/bin/env python3
"""
canary_x402_seed.py — x402 GoPlausible registration sweep (PARALLEL, DELTA-ONLY)
LOCAL ONLY — never commit. CANARY_WALLET_MNEMONIC via env only.

Payment path: run_helper() shells out to a TypeScript program via tsx.
This is the only sanctioned route — Python may not call @x402/* or
@pdc/x402-adapter directly (CLAUDE.md hard ban). run_helper() is sync;
called via asyncio.to_thread() so it doesn't block the event loop.

Behaviour:
  - Queries Supabase for active endpoints where goplausible_registered = false
  - Checks ALGO wallet balance before spending anything
  - Fires payments in parallel, capped at MAX_CONCURRENT simultaneous requests
  - Each helper call has a hard timeout (REQUEST_TIMEOUT_SECONDS + 10s startup)
  - On settlement: marks goplausible_registered = true in Supabase by row ID
  - Retries only on 503 (cold isolate), exponential backoff: 5→10→20→40→80s
  - Refuses self-payment, wrong network, price > listed+10% (enforced in TS helper)
  - Circuit breaker: aborts if CIRCUIT_BREAKER_THRESHOLD consecutive systemic
    failures (not 503 cold-starts) occur
  - Dry-run mode (--dry-run): uses inspectOnly=true; exercises helper without paying
"""

from __future__ import annotations

import asyncio
import aiohttp
import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

# ── import the only sanctioned payment helper ──────────────────────────────────
_HELPER_DIR = (
    Path(__file__).resolve().parents[1]
    / "apps" / "pdqe-pipeline" / "app" / "integration"
)
sys.path.insert(0, str(_HELPER_DIR))
from x402_canary_helper import run_helper, max_atomic_for, CAIP2  # noqa: E402

# ── constants ──────────────────────────────────────────────────────────────────
MAX_RETRIES                = 5
RETRY_DELAY_BASE           = 5         # seconds; actual = base * 2^(attempt-1)
MAX_CONCURRENT             = 8         # semaphore — max parallel requests
REQUEST_TIMEOUT_SECONDS    = 30        # per-request ceiling
HELPER_STARTUP_BUFFER      = 10        # extra seconds for tsx startup
COLD_ISOLATE_STATUS        = 503
CIRCUIT_BREAKER_THRESHOLD  = 5         # systemic (non-503) failures before abort
ALGORAND_NETWORK           = os.environ.get("ALGORAND_NETWORK", "mainnet")
SUPABASE_URL               = os.environ["SUPABASE_URL"]
SUPABASE_KEY               = os.environ["SUPABASE_SERVICE_KEY"]
AGENT_WALLET_ADDRESS       = os.environ["AGENT_WALLET_ADDRESS"]   # payer; self-payment guard
ALGOD_URL                  = "https://mainnet-api.algonode.cloud"
JSONL_LOG                  = "canary_x402_seed.jsonl"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── helpers ────────────────────────────────────────────────────────────────────

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def exponential_delay(attempt: int) -> float:
    return RETRY_DELAY_BASE * (2 ** (attempt - 1))   # 5, 10, 20, 40, 80s

def build_url(row: dict) -> str:
    """Construct full endpoint URL from base + pricing_tiers[0].path."""
    base  = (row.get("endpoint_url") or "").rstrip("/")
    tiers = row.get("pricing_tiers") or []
    path  = (tiers[0].get("path", "") if tiers else "").replace(":nation_code", "WS")
    if path == "/tourism/search":
        path += "?nation_code=WS"
    if path == "/tourism/transport/routes":
        path += "?origin=WS&destination=WS"
    return base + path

def supabase_headers() -> dict:
    return {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    }

# ── wallet pre-check ───────────────────────────────────────────────────────────

async def check_wallet_balance(
    session: aiohttp.ClientSession,
    address: str,
    required_usdc: float,
) -> bool:
    url = f"{ALGOD_URL}/v2/accounts/{address}"
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as r:
            if r.status != 200:
                log.warning("wallet balance check: status %s — skipping", r.status)
                return True
            data    = await r.json()
            algo    = data.get("amount", 0) / 1_000_000
            print(f"  Wallet ALGO balance:  {algo:.4f} ALGO")
            print(f"  Est. sweep cost:      ${required_usdc:.4f} USDC")
            if algo < 0.1:
                print("  ⚠️  WARNING: wallet balance is very low")
                return input("  Continue anyway? [y/N] ").strip().lower() == "y"
            return True
    except Exception as exc:
        log.warning("wallet balance check failed: %s — continuing", exc)
        return True

# ── Supabase ───────────────────────────────────────────────────────────────────

async def fetch_pending(session: aiohttp.ClientSession) -> list[dict]:
    """Return active endpoints not yet registered on GoPlausible."""
    url    = f"{SUPABASE_URL}/rest/v1/endpoints"
    params = {
        "select":                 "id,title,endpoint_url,pricing_tiers",
        "is_active":              "eq.true",
        "goplausible_registered": "eq.false",
        "order":                  "endpoint_url.asc",
    }
    async with session.get(
        url, params=params, headers=supabase_headers(),
        timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT_SECONDS),
    ) as r:
        r.raise_for_status()
        rows = await r.json()
    # Deduplicate by constructed URL
    seen, unique = set(), []
    for row in rows:
        full = build_url(row)
        if full in seen:
            log.info("skip %s: duplicate URL %s", row["id"], full)
            continue
        seen.add(full)
        unique.append(row)
    return unique

async def mark_registered(session: aiohttp.ClientSession, row_id: str) -> None:
    url    = f"{SUPABASE_URL}/rest/v1/endpoints"
    params = {"id": f"eq.{row_id}"}
    async with session.patch(
        url, params=params, headers=supabase_headers(),
        json={"goplausible_registered": True},
        timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT_SECONDS),
    ) as r:
        if r.status not in (200, 204):
            log.warning("mark_registered failed for %s: %s", row_id, r.status)

# ── payment via run_helper (only sanctioned path) ─────────────────────────────

async def pay_endpoint(
    session:     aiohttp.ClientSession,
    semaphore:   asyncio.Semaphore,
    row:         dict,
    dry_run:     bool = False,
    max_retries: int  = MAX_RETRIES,
) -> dict:
    row_id   = row["id"]
    full_url = build_url(row)
    tiers    = row.get("pricing_tiers") or [{}]
    price    = Decimal(str(tiers[0].get("price_usdc", 0) or 0))

    job = {
        "url":           full_url,
        "maxAtomic":     str(max_atomic_for(price)),   # listed + 10%, atomic USDC
        "network":       ALGORAND_NETWORK,
        "caip2":         CAIP2[ALGORAND_NETWORK],
        "expectedPayer": AGENT_WALLET_ADDRESS,          # self-payment guard
        "inspectOnly":   dry_run,
    }

    result: dict = {
        "id": row_id, "url": full_url, "listed_price": float(price),
        "outcome": None, "attempts": 0, "algo_tx_id": None,
        "http_status": None, "ts": now_iso(),
    }

    async with semaphore:
        for attempt in range(1, max_retries + 1):
            result["attempts"] = attempt
            try:
                # run_helper is a blocking subprocess call — run in thread pool
                pay = await asyncio.wait_for(
                    asyncio.to_thread(run_helper, job),
                    timeout=REQUEST_TIMEOUT_SECONDS + HELPER_STARTUP_BUFFER,
                )
            except asyncio.TimeoutError:
                log.warning("  [%s] %s TIMEOUT attempt %d/%d",
                            now_iso(), full_url, attempt, max_retries)
                result["outcome"] = "timeout"
                if attempt < max_retries:
                    await asyncio.sleep(exponential_delay(attempt))
                    continue
                break
            except Exception as exc:
                log.error("  [%s] %s exception: %s", now_iso(), full_url, exc)
                result["outcome"] = "error"
                break

            outcome     = pay.get("outcome")
            http_status = pay.get("http_status")
            result["http_status"] = http_status

            # Dry-run: helper ran with inspectOnly=true, no payment made
            if dry_run and outcome == "would_pay":
                result["outcome"] = "would_pay"
                log.info("  [dry-run] %s would_pay $%s USDC", full_url, price)
                break

            # Settlement
            if outcome == "settled":
                result["outcome"]    = "settled"
                result["algo_tx_id"] = pay.get("algo_tx_id")
                log.info("  [%s] %s SETTLED tx=%s (attempt %d)",
                         now_iso(), full_url, result["algo_tx_id"], attempt)
                await mark_registered(session, row_id)
                break

            # Cold isolate: 503 before x402 gate fired — retry with backoff
            if outcome == "not_x402_gated" and http_status == COLD_ISOLATE_STATUS:
                if attempt < max_retries:
                    delay = exponential_delay(attempt)
                    log.warning("  [%s] %s 503 cold attempt %d/%d — retry in %.0fs",
                                now_iso(), full_url, attempt, max_retries, delay)
                    await asyncio.sleep(delay)
                    continue
                result["outcome"] = "not_x402_gated"
                break

            # All other outcomes (refused_*, helper_unavailable, not_settled,
            # error, not_x402_gated non-503) — do not retry
            result["outcome"] = outcome
            log.warning("  [%s] %s → %s (http=%s)",
                        now_iso(), full_url, outcome, http_status)
            break

    if result["outcome"] is None:
        result["outcome"] = "not_x402_gated"
    return result

# ── sweep ──────────────────────────────────────────────────────────────────────

async def sweep(
    max_retries: int  = MAX_RETRIES,
    max_conc:    int  = MAX_CONCURRENT,
    dry_run:     bool = False,
    canary_addr: str  = "",
) -> dict:
    timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT_SECONDS)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        pending = await fetch_pending(session)

        if not pending:
            print("✅ All active endpoints are already registered on GoPlausible. Nothing to do.")
            return {"endpoints": 0, "settled": 0}

        total_price = sum(
            float((r.get("pricing_tiers") or [{}])[0].get("price_usdc", 0) or 0)
            for r in pending
        )

        print(f"""
  GoPlausible Registration Sweep — DELTA ONLY
  ─────────────────────────────────────────────
  Pending (unregistered):  {len(pending)} endpoint(s)
  Est. sweep cost:         ${total_price:.4f} USDC
  Concurrency cap:         {max_conc} parallel requests
  Request timeout:         {REQUEST_TIMEOUT_SECONDS}s (+{HELPER_STARTUP_BUFFER}s helper startup)
  Retry policy:            {max_retries} attempts, backoff 5→10→20→40→80s (503 only)
  Mode:                    {'DRY RUN — no payments made' if dry_run else 'LIVE'}
""")
        for ep in pending:
            price = float((ep.get("pricing_tiers") or [{}])[0].get("price_usdc", 0) or 0)
            print(f"  → {build_url(ep)}  (${price:.4f})")
        print()

        semaphore = asyncio.Semaphore(max_conc)

        if dry_run:
            tasks   = [pay_endpoint(session, semaphore, ep, dry_run=True, max_retries=1)
                       for ep in pending]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            ok      = sum(1 for r in results if isinstance(r, dict) and r["outcome"] == "would_pay")
            blocked = sum(1 for r in results if isinstance(r, dict) and r["outcome"] != "would_pay")
            print(f"  ── DRY RUN complete: {ok}/{len(pending)} would proceed. "
                  f"{blocked} blocked (refused/unavailable). ──")
            print(f"  Pass --once to run live.\n")
            return {"endpoints": len(pending), "dry_run": True, "would_pay": ok}

        if canary_addr:
            ok = await check_wallet_balance(session, canary_addr, total_price)
            if not ok:
                print("  Sweep aborted.")
                return {"aborted": True}

        input("Press Enter to register, Ctrl-C to abort… ")

        consecutive_systemic = 0
        circuit_open         = False

        async def guarded(row: dict) -> dict:
            nonlocal consecutive_systemic, circuit_open
            if circuit_open:
                return {"id": row["id"], "url": build_url(row),
                        "outcome": "circuit_breaker", "attempts": 0,
                        "http_status": None, "ts": now_iso()}
            r = await pay_endpoint(session, semaphore, row,
                                   dry_run=False, max_retries=max_retries)
            is_systemic = r["outcome"] not in (
                "settled", "not_x402_gated", "would_pay",
                "refused_price_mismatch", "refused_wrong_network",
                "refused_self_payment",   # these are expected, not systemic
            )
            if is_systemic:
                consecutive_systemic += 1
                if consecutive_systemic >= CIRCUIT_BREAKER_THRESHOLD:
                    circuit_open = True
                    log.error("🔴 CIRCUIT BREAKER — %d consecutive systemic failures. "
                              "Check Worker health and wallet.", CIRCUIT_BREAKER_THRESHOLD)
            else:
                consecutive_systemic = 0
            return r

        t0      = time.monotonic()
        tasks   = [guarded(ep) for ep in pending]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        elapsed = time.monotonic() - t0

    def count(outcome: str) -> int:
        return sum(1 for r in results if isinstance(r, dict) and r.get("outcome") == outcome)

    refused = sum(
        1 for r in results
        if isinstance(r, dict) and (r.get("outcome") or "").startswith("refused_")
    )
    errors  = sum(1 for r in results if isinstance(r, Exception))

    summary = {
        "endpoints": len(pending), "elapsed_s": round(elapsed, 1),
        "settled":         count("settled"),
        "not_x402_gated":  count("not_x402_gated"),
        "not_settled":     count("not_settled"),
        "timeouts":        count("timeout"),
        "circuit_blocked": count("circuit_breaker"),
        "refused":         refused,
        "errors":          errors,
    }
    log.info("sweep complete: %s", json.dumps(summary))

    with open(JSONL_LOG, "a") as f:
        for r in results:
            if isinstance(r, dict):
                f.write(json.dumps(r) + "\n")

    print(f"\n{'─'*54}")
    print(f"  settled:          {summary['settled']}")
    print(f"  not_x402_gated:   {summary['not_x402_gated']}  (re-run after Worker warms)")
    print(f"  not_settled:      {summary['not_settled']}")
    print(f"  refused:          {refused}  (price/network/self-payment guards)")
    print(f"  timeouts:         {summary['timeouts']}")
    print(f"  circuit_blocked:  {summary['circuit_blocked']}")
    print(f"  errors:           {errors}")
    print(f"  elapsed:          {elapsed:.1f}s")
    if circuit_open:
        print(f"\n  🔴 Circuit breaker triggered — check Worker status and wallet.")
    print(f"{'─'*54}\n")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="GoPlausible x402 registration sweep — delta-only, parallel."
    )
    parser.add_argument("--once",        action="store_true",
                        help="Run one live sweep")
    parser.add_argument("--dry-run",     action="store_true",
                        help="Preview without paying (uses inspectOnly in helper)")
    parser.add_argument("--max-retries", type=int, default=MAX_RETRIES,
                        help=f"Max attempts per endpoint (default {MAX_RETRIES})")
    parser.add_argument("--max-conc",    type=int, default=MAX_CONCURRENT,
                        help=f"Max parallel requests (default {MAX_CONCURRENT})")
    parser.add_argument("--wallet",      type=str, default=AGENT_WALLET_ADDRESS,
                        help="Canary wallet address for ALGO balance pre-check")
    args = parser.parse_args()

    if not args.once and not args.dry_run:
        print("Pass --once for a live sweep, or --dry-run to preview. Exiting.")
        sys.exit(0)

    asyncio.run(sweep(
        max_retries = args.max_retries,
        max_conc    = args.max_conc,
        dry_run     = args.dry_run,
        canary_addr = args.wallet,
    ))


if __name__ == "__main__":
    main()
