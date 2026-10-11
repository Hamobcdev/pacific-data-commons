"""
PDQE Stage 09 — Supabase client for PDC integration.

Calls the four Stage 09 transition RPCs (migration 20261012000006). Each RPC
re-checks source state, endpoint status, the endpoint ↔ source binding,
wallet format, tier floor and set-once fields — the Python checks exist for
clear error messages. Endpoint reads reuse the Stage 08 client.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from postgrest import APIError

from app.endpoint.supabase_client import fetch_endpoint, fetch_source
from app.validation.supabase_client import _get_client

logger = logging.getLogger(__name__)

__all__ = [
    "fetch_endpoint",
    "fetch_source",
    "call_endpoint_validated",
    "call_provider_approved",
    "call_published",
    "call_x402_queryable",
]

TRANSITION_ENDPOINT_VALIDATED = "transition_to_endpoint_validated"
TRANSITION_PROVIDER_APPROVED = "transition_to_provider_approved"
TRANSITION_PUBLISHED = "transition_to_published"
TRANSITION_X402_QUERYABLE = "transition_to_x402_queryable"


def _rpc(name: str, params: dict) -> None:
    client = _get_client()
    try:
        client.schema("pdqe").rpc(name, params).execute()
    except APIError as exc:
        raise ValueError(f"{name} refused for source {params.get('p_source_id')}: {exc}") from exc
    logger.info("%s: source %s endpoint %s", name, params.get("p_source_id"), params.get("p_endpoint_id"))


def call_endpoint_validated(source_id: str, endpoint_id: str) -> None:
    """ENDPOINT_GENERATED → ENDPOINT_VALIDATED (endpoint DRAFT → VALIDATED)."""
    _rpc(TRANSITION_ENDPOINT_VALIDATED, {"p_source_id": source_id, "p_endpoint_id": endpoint_id})


def call_provider_approved(
    source_id: str, endpoint_id: str, provider_wallet: str, price_usdc: Decimal, endpoint_hash: str
) -> None:
    """ENDPOINT_VALIDATED → PROVIDER_APPROVED (wallet, price, hash frozen)."""
    _rpc(
        TRANSITION_PROVIDER_APPROVED,
        {
            "p_source_id": source_id,
            "p_endpoint_id": endpoint_id,
            "p_provider_wallet": provider_wallet,
            # String, not float — no binary rounding on the way to NUMERIC(10,4).
            "p_price_usdc": f"{price_usdc:.4f}",
            "p_endpoint_hash": endpoint_hash,
        },
    )


def call_published(source_id: str, endpoint_id: str) -> None:
    """PROVIDER_APPROVED → PUBLISHED (endpoint VALIDATED → PUBLISHED)."""
    _rpc(TRANSITION_PUBLISHED, {"p_source_id": source_id, "p_endpoint_id": endpoint_id})


def call_x402_queryable(source_id: str, endpoint_id: str, registration_id: str) -> None:
    """PUBLISHED → x402_QUERYABLE (records the adapter registration id)."""
    _rpc(
        TRANSITION_X402_QUERYABLE,
        {"p_source_id": source_id, "p_endpoint_id": endpoint_id, "p_x402_registration_id": registration_id},
    )
