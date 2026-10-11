"""
PDQE Stage 09 — Thin wrapper around pdc-x402-adapter.

NEVER calls x402 packages directly — always via the adapter. This module
makes no payment, signs nothing and holds no funds (P2): it asks the adapter
to register a payTo route whose payTo is the provider's own wallet.

VITE_FLAG_LIVE_RPC_ACTIVE guard: unless the env var is exactly "true" at
call time, return a deterministic mock registration result and make no
network call — even when X402_ADAPTER_URL is set. Committed code always runs
with the flag false. Mock registration ids carry a "mock-" prefix so the DB
audit trail never mistakes a mock registration for a live one.

Live mode (runtime opt-in only): POST {X402_ADAPTER_URL}/register with the
endpoint spec, then P9-validate the response — it must echo the exact path,
price, wallet and sovereignty flag that were sent.
"""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timezone

from pydantic import ValidationError

from app.endpoint.schemas import EndpointRecord, EndpointStatus
from app.integration.schemas import X402RegistrationResult

logger = logging.getLogger(__name__)

MOCK_ID_PREFIX = "mock-"
ADAPTER_TIMEOUT_SECONDS = 10.0


def _live_rpc_active() -> bool:
    """Read at call time so the flag can never be latched on at import."""
    return os.getenv("VITE_FLAG_LIVE_RPC_ACTIVE", "false").strip().lower() == "true"


def mock_registration_id(endpoint: EndpointRecord) -> str:
    """Deterministic: the same endpoint spec always yields the same mock id."""
    digest = hashlib.sha256((endpoint.endpoint_hash + endpoint.path).encode("utf-8")).hexdigest()
    return f"{MOCK_ID_PREFIX}{digest[:16]}"


def _registration_payload(endpoint: EndpointRecord) -> dict:
    return {
        "endpoint_id": str(endpoint.endpoint_id),
        "path": endpoint.path,
        "method": "GET",
        "price_usdc": f"{endpoint.price_usdc:.4f}",
        "pay_to": endpoint.provider_wallet,
        "title": endpoint.title,
        "description": endpoint.description,
        "domain": endpoint.domain.value,
        "pricing_tier": endpoint.pricing_tier.value,
        "cultural_sovereignty": endpoint.cultural_sovereignty,
        "endpoint_hash": endpoint.endpoint_hash,
    }


def _check_echo(endpoint: EndpointRecord, result: X402RegistrationResult) -> None:
    """The adapter must have registered exactly what was approved."""
    mismatches = [
        name
        for name, sent, got in (
            ("path", endpoint.path, result.path),
            ("price_usdc", endpoint.price_usdc, result.price_usdc),
            ("provider_wallet", endpoint.provider_wallet, result.provider_wallet),
            ("cultural_sovereignty", endpoint.cultural_sovereignty, result.cultural_sovereignty),
        )
        if sent != got
    ]
    if result.mock:
        mismatches.append("mock")
    if result.registration_id.startswith(MOCK_ID_PREFIX):
        mismatches.append("registration_id")
    if mismatches:
        raise ValueError(f"pdc-x402-adapter response does not match the endpoint: {', '.join(mismatches)}")


def _register_live(endpoint: EndpointRecord) -> X402RegistrationResult:
    adapter_url = os.getenv("X402_ADAPTER_URL", "").strip().rstrip("/")
    if not adapter_url.startswith("https://"):
        raise RuntimeError("X402_ADAPTER_URL must be set to an https:// URL when VITE_FLAG_LIVE_RPC_ACTIVE=true")

    import httpx  # deferred: mock mode never imports a network client

    headers = {"Content-Type": "application/json"}
    api_key = os.getenv("X402_ADAPTER_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        response = httpx.post(
            f"{adapter_url}/register",
            json=_registration_payload(endpoint),
            headers=headers,
            timeout=ADAPTER_TIMEOUT_SECONDS,
            follow_redirects=False,
        )
        response.raise_for_status()
        body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise RuntimeError(f"pdc-x402-adapter registration failed for {endpoint.path}: {exc}") from exc

    try:
        result = X402RegistrationResult.model_validate(body)
    except ValidationError as exc:
        raise ValueError(f"pdc-x402-adapter returned a malformed registration: {exc}") from exc
    _check_echo(endpoint, result)
    return result


def register_endpoint(endpoint: EndpointRecord) -> X402RegistrationResult:
    """
    Register a PUBLISHED endpoint with x402 via pdc-x402-adapter.

    If VITE_FLAG_LIVE_RPC_ACTIVE is not "true" (default; always false in
    committed code): return a mock X402RegistrationResult with the
    deterministic registration_id "mock-" + sha256(endpoint_hash + path)[:16].
    No network call is made.

    If it is "true" (set only at runtime, never committed): POST to
    X402_ADAPTER_URL/register and P9-validate the response before returning.
    """
    if endpoint.status != EndpointStatus.PUBLISHED or not endpoint.provider_wallet:
        raise ValueError(f"Endpoint {endpoint.endpoint_id} must be PUBLISHED with a provider wallet to register")

    if not _live_rpc_active():
        logger.info("x402 registration for %s in mock mode (VITE_FLAG_LIVE_RPC_ACTIVE=false)", endpoint.path)
        return X402RegistrationResult(
            registration_id=mock_registration_id(endpoint),
            path=endpoint.path,
            price_usdc=endpoint.price_usdc,
            provider_wallet=endpoint.provider_wallet,
            registered_at=datetime.now(timezone.utc),
            cultural_sovereignty=endpoint.cultural_sovereignty,
            mock=True,
        )

    return _register_live(endpoint)
