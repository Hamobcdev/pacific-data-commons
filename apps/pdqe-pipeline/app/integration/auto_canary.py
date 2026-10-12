"""
PDQE Stage 11 — best-effort auto-canary payment on publication.

GoPlausible lists an x402 endpoint when its first payment settles; there is no
registration API. Right after SBP publication (approver.publish_endpoint),
this module fires one canary payment from SBP's declared canary wallet at the
endpoint's listed price, so a freshly published endpoint is listed without
waiting for a first organic buyer.

Never blocks or fails publication: schedule_auto_canary() checks its cheap
gates in the caller's thread, then runs the payment on a daemon thread, and
every path catches and logs. Nothing is written back to the DB; the listing
is a side effect of settlement.

Skips (logged at WARNING), in order:
  * CANARY_WALLET_MNEMONIC empty (dev/CI default);
  * VITE_FLAG_LIVE_RPC_ACTIVE not "true" (same runtime-only live switch as
    x402_client; always false in committed code);
  * AGENT_WALLET_ADDRESS missing or not an Algorand address;
  * no served URL: PDQE_ENDPOINT_BASE_URL unset (pdqe.endpoints stores only
    the path, /pacific/{domain}/{slug});
  * canary wallet == endpoint payTo (self-payment);
  * HEAD on the served URL returns 404, or fails;
  * the helper refuses (live 402 asks > listed price + 10%, wrong network,
    payTo is the payer) or cannot run.

Environment (Render; never committed):
  AGENT_WALLET_ADDRESS    canary payer address (sbp-agent wallet)
  CANARY_WALLET_MNEMONIC  canary payer mnemonic (classified)
  PDQE_ENDPOINT_BASE_URL  https base URL that serves PDQE endpoint paths
  CANARY_HELPER_DIR       optional; defaults to the repo's apps/directory-api/test
  ALGORAND_NETWORK        optional; "mainnet" (default) or "testnet"

Runtime requirement: the payment runs the TypeScript helper in
app.integration.x402_canary_helper, so the host needs Node, npx and the built
pnpm workspace (@pdc/x402-adapter). A Python-only host logs
"helper_unavailable" and skips.
"""

from __future__ import annotations

import logging
import os
import re
import threading
from pathlib import Path

import httpx

from app.endpoint.schemas import EndpointRecord
from app.integration.x402_canary_helper import (
    CAIP2,
    DEFAULT_HELPER_DIR,
    MNEMONIC_ENV,
    max_atomic_for,
    run_helper,
)
from app.integration.x402_client import _live_rpc_active

logger = logging.getLogger(__name__)

ADDRESS_ENV = "AGENT_WALLET_ADDRESS"
BASE_URL_ENV = "PDQE_ENDPOINT_BASE_URL"
HELPER_DIR_ENV = "CANARY_HELPER_DIR"
NETWORK_ENV = "ALGORAND_NETWORK"
HEAD_TIMEOUT_SECONDS = 10.0
_ALGORAND_ADDRESS = re.compile(r"^[A-Z2-7]{58}$")

SKIPPED_DISABLED = "skipped_disabled"
SKIPPED_LIVE_RPC_INACTIVE = "skipped_live_rpc_inactive"
SKIPPED_BAD_CONFIG = "skipped_bad_config"
SKIPPED_NO_URL = "skipped_no_endpoint_url"
SKIPPED_SELF_PAYMENT = "skipped_self_payment"
SKIPPED_NOT_FOUND = "skipped_not_found"
SKIPPED_HEAD_FAILED = "skipped_head_failed"
SETTLED = "settled"
ERROR = "error"


def _disabled_reason() -> str | None:
    """Cheap gates that need no endpoint and no network. None means enabled."""
    if not os.getenv(MNEMONIC_ENV, "").strip():
        return SKIPPED_DISABLED
    if not _live_rpc_active():
        return SKIPPED_LIVE_RPC_INACTIVE
    return None


def served_url(endpoint: EndpointRecord) -> str | None:
    """https URL an x402 client would call for this endpoint, or None if unknown."""
    base = os.getenv(BASE_URL_ENV, "").strip().rstrip("/")
    if not base.startswith("https://"):
        return None
    return f"{base}{endpoint.path}"


def fire_auto_canary(endpoint: EndpointRecord) -> str:
    """
    Make at most one canary payment for a PUBLISHED endpoint. Returns the
    outcome string. Never raises.
    """
    try:
        return _fire(endpoint)
    except Exception:  # noqa: BLE001 — best-effort by design
        logger.warning("auto-canary %s: unexpected error", endpoint.endpoint_id, exc_info=True)
        return ERROR


def _fire(endpoint: EndpointRecord) -> str:
    eid = endpoint.endpoint_id

    reason = _disabled_reason()
    if reason:
        logger.warning("auto-canary %s: %s", eid, reason)
        return reason

    payer = os.getenv(ADDRESS_ENV, "").strip()
    network = os.getenv(NETWORK_ENV, "mainnet").strip() or "mainnet"
    if not _ALGORAND_ADDRESS.match(payer) or network not in CAIP2:
        logger.warning("auto-canary %s: %s (AGENT_WALLET_ADDRESS / ALGORAND_NETWORK)", eid, SKIPPED_BAD_CONFIG)
        return SKIPPED_BAD_CONFIG

    url = served_url(endpoint)
    if url is None:
        logger.warning("auto-canary %s: %s (PDQE_ENDPOINT_BASE_URL unset)", eid, SKIPPED_NO_URL)
        return SKIPPED_NO_URL

    if endpoint.provider_wallet == payer:
        logger.warning("auto-canary %s: %s (payTo %s is the canary wallet)", eid, SKIPPED_SELF_PAYMENT, payer)
        return SKIPPED_SELF_PAYMENT

    try:
        head = httpx.head(url, timeout=HEAD_TIMEOUT_SECONDS, follow_redirects=False)
    except httpx.HTTPError as exc:
        logger.warning("auto-canary %s: %s %s (%s)", eid, SKIPPED_HEAD_FAILED, url, exc)
        return SKIPPED_HEAD_FAILED
    if head.status_code == 404:
        logger.warning("auto-canary %s: %s %s", eid, SKIPPED_NOT_FOUND, url)
        return SKIPPED_NOT_FOUND

    helper_dir = Path(os.getenv(HELPER_DIR_ENV, "").strip() or DEFAULT_HELPER_DIR)
    result = run_helper(
        {
            "url": url,
            "maxAtomic": str(max_atomic_for(endpoint.price_usdc)),
            "network": network,
            "caip2": CAIP2[network],
            "expectedPayer": payer,
            "inspectOnly": False,
        },
        helper_dir,
    )
    outcome = str(result.get("outcome", ERROR))
    details = {k: v for k, v in result.items() if k != "outcome"}
    if outcome == SETTLED:
        logger.info("auto-canary %s: settled %s %s", eid, url, details)
    else:
        logger.warning("auto-canary %s: %s %s %s", eid, outcome, url, details)
    return outcome


def schedule_auto_canary(endpoint: EndpointRecord) -> None:
    """
    Fire-and-forget entry point for approver.publish_endpoint. Returns at
    once; the payment (HEAD + helper, up to ~100s) runs on a daemon thread.
    Never raises.
    """
    try:
        reason = _disabled_reason()
        if reason:
            logger.warning("auto-canary %s: %s", endpoint.endpoint_id, reason)
            return
        threading.Thread(
            target=fire_auto_canary,
            args=(endpoint,),
            name=f"auto-canary-{endpoint.endpoint_id}",
            daemon=True,
        ).start()
    except Exception:  # noqa: BLE001 — best-effort by design
        logger.warning("auto-canary %s: could not schedule", endpoint.endpoint_id, exc_info=True)
