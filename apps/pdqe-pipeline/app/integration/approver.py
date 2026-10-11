"""
PDQE Stage 09 — Provider approval and SBP publication flows.

Provider approval fixes the provider's wallet and price on a VALIDATED
endpoint; SBP publication then makes it PUBLISHED. Both are human gates and
neither can be skipped: the DB refuses PUBLISHED without provider_approved_at
and freezes wallet, price and hash once approval is recorded.

Changing the price changes the spec, so the endpoint hash is recomputed here
(same recipe as Stage 08) and stored with the approval; publication re-checks
it before going live.

P9: request bodies are re-validated and every row read back is re-parsed
through the strict schemas.
"""

from __future__ import annotations

import logging
from uuid import UUID

from pydantic import ValidationError

from app.endpoint.generator import compute_endpoint_hash
from app.endpoint.schemas import TIER_PRICES, EndpointRecord, EndpointStatus
from app.integration import supabase_client as db
from app.integration.auto_canary import schedule_auto_canary
from app.integration.schemas import ProviderApprovalInput

logger = logging.getLogger(__name__)


# ── Shared helpers (also used by app.integration.pipeline) ───────────────────

def load_endpoint(endpoint_id: UUID) -> EndpointRecord:
    """Load and strictly parse one endpoint. ValueError if missing or malformed."""
    row = db.fetch_endpoint(str(endpoint_id))
    try:
        return EndpointRecord.model_validate(row)
    except ValidationError as exc:
        raise ValueError(f"Endpoint row {endpoint_id} failed schema validation: {exc}") from exc


def require_source_state(source_id: UUID, endpoint: EndpointRecord, expected: str) -> None:
    """The source must be in `expected` and be one of the endpoint's provenance sources."""
    if source_id not in endpoint.provenance_source_ids:
        raise ValueError(f"Source {source_id} is not a provenance source of endpoint {endpoint.endpoint_id}")
    state = db.fetch_source(str(source_id)).get("lifecycle_state")
    if state != expected:
        raise ValueError(f"Source {source_id} is in state '{state}', expected {expected}")


def require_hash_intact(endpoint: EndpointRecord) -> None:
    if compute_endpoint_hash(endpoint) != endpoint.endpoint_hash:
        raise ValueError(f"Endpoint {endpoint.endpoint_id} hash does not match its stored spec")


# ── Provider approval ─────────────────────────────────────────────────────────

def submit_provider_approval(
    endpoint_id: UUID,
    source_id: UUID,
    input: ProviderApprovalInput,
) -> EndpointRecord:
    """
    1. Verify endpoint status == 'VALIDATED' (and not already approved)
    2. P9-validate ProviderApprovalInput
    3. Verify Algorand wallet format
    4. If price_usdc provided, verify >= tier floor
    5. Call pdqe.transition_to_provider_approved RPC
    6. Return updated EndpointRecord
    """
    try:
        approval = ProviderApprovalInput.model_validate(input.model_dump())
    except ValidationError as exc:
        raise ValueError(f"Provider approval is invalid: {exc}") from exc

    endpoint = load_endpoint(endpoint_id)
    if endpoint.status != EndpointStatus.VALIDATED:
        raise ValueError(f"Endpoint {endpoint_id} is {endpoint.status.value}, provider approval requires VALIDATED")
    if endpoint.provider_approved_at is not None:
        raise ValueError(f"Endpoint {endpoint_id} was already approved at {endpoint.provider_approved_at}")
    require_source_state(source_id, endpoint, "ENDPOINT_VALIDATED")
    require_hash_intact(endpoint)

    price = approval.price_usdc if approval.price_usdc is not None else endpoint.price_usdc
    floor = TIER_PRICES[endpoint.pricing_tier]
    if price < floor:
        raise ValueError(f"price_usdc {price} is below the {endpoint.pricing_tier.value} floor {floor}")

    approved_spec = endpoint.model_copy(update={"price_usdc": price})
    new_hash = compute_endpoint_hash(approved_spec)

    db.call_provider_approved(str(source_id), str(endpoint_id), approval.provider_wallet, price, new_hash)

    updated = load_endpoint(endpoint_id)
    if (
        updated.provider_approved_at is None
        or updated.provider_wallet != approval.provider_wallet
        or updated.price_usdc != price
        or updated.endpoint_hash != new_hash
    ):
        raise RuntimeError(f"Endpoint {endpoint_id} read back without the approved wallet, price and hash")
    logger.info("Endpoint %s approved by provider at %s USDC/query", endpoint_id, price)
    return updated


# ── SBP publication ───────────────────────────────────────────────────────────

def publish_endpoint(
    endpoint_id: UUID,
    source_id: UUID,
) -> EndpointRecord:
    """
    SBP admin action.
    1. Verify endpoint provider_approved_at IS NOT NULL
    2. Verify provider_wallet IS NOT NULL
    3. Call pdqe.transition_to_published RPC
    4. Return updated EndpointRecord
    """
    endpoint = load_endpoint(endpoint_id)
    if endpoint.provider_approved_at is None:
        raise ValueError(f"Endpoint {endpoint_id} has not been approved by its provider")
    if not endpoint.provider_wallet:
        raise ValueError(f"Endpoint {endpoint_id} has no provider wallet")
    if endpoint.status != EndpointStatus.VALIDATED:
        raise ValueError(f"Endpoint {endpoint_id} is {endpoint.status.value}, publication requires VALIDATED")
    require_source_state(source_id, endpoint, "PROVIDER_APPROVED")
    require_hash_intact(endpoint)

    db.call_published(str(source_id), str(endpoint_id))

    updated = load_endpoint(endpoint_id)
    if updated.status != EndpointStatus.PUBLISHED:
        raise RuntimeError(f"Endpoint {endpoint_id} read back as {updated.status.value}, expected PUBLISHED")
    logger.info("Endpoint %s published at %s", endpoint_id, updated.path)

    # Stage 11: best-effort canary payment so GoPlausible lists the endpoint
    # on first settlement. Publication is already committed; this must never
    # block or fail it.
    try:
        schedule_auto_canary(updated)
    except Exception:  # noqa: BLE001
        logger.warning("Auto-canary scheduling failed for endpoint %s", endpoint_id, exc_info=True)
    return updated
