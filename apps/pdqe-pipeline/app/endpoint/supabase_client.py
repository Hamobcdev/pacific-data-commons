"""
PDQE Stage 08 — Supabase client for endpoint generation.

Reads the dataset, primary source, approving Jev assessment and collection
links an endpoint is generated from, writes pdqe.endpoints, and advances the
lifecycle via pdqe.transition_to_endpoint_generated (migration
20261012000004). All DB access uses SUPABASE_SERVICE_KEY — same client
factory as Stages 05–07.

The DB re-enforces every rule checked in Python (dataset/source state,
provenance match, collection link, sovereignty flag, DRAFT on insert,
immutable provenance) — the checks here exist for clear error messages.
"""

from __future__ import annotations

import logging
from typing import Optional

from postgrest import APIError

from app.dataset.supabase_client import _fetch_one, _insert, fetch_dataset, fetch_latest_validation
from app.validation.supabase_client import _get_client

logger = logging.getLogger(__name__)

__all__ = [
    "fetch_dataset",
    "fetch_latest_validation",
    "fetch_source",
    "fetch_assessment",
    "list_dataset_collection_ids",
    "fetch_endpoint",
    "fetch_endpoint_for_dataset",
    "insert_endpoint",
    "list_endpoints",
    "call_transition",
]

_SOURCE_COLUMNS = "source_id, lifecycle_state, source_type, licence_status"
_ASSESSMENT_COLUMNS = "id, source_id, extraction_id, completeness_score, domain_classification"
_ENDPOINT_COLUMNS = (
    "endpoint_id, dataset_id, collection_id, path, slug, title, description, domain, "
    "pricing_tier, price_usdc, cultural_sovereignty, provider_wallet, response_schema, "
    "parameters, query_examples, endpoint_hash, provenance_dataset_id, "
    "provenance_source_ids, status, generated_at, updated_at, "
    "provider_approved_at, x402_registration_id, x402_registered_at"
)

TRANSITION_ENDPOINT_GENERATED = "transition_to_endpoint_generated"
MAX_LIST_PAGE = 100


def fetch_source(source_id: str) -> dict:
    """Load the pdqe.sources columns Stage 08 reads. ValueError if missing."""
    return _fetch_one("sources", _SOURCE_COLUMNS, "source_id", source_id, "Source")


def fetch_assessment(assessment_id: str) -> dict:
    """Load the pdqe.jev_assessments row (completeness_score for pricing)."""
    return _fetch_one("jev_assessments", _ASSESSMENT_COLUMNS, "id", assessment_id, "Assessment")


def list_dataset_collection_ids(dataset_id: str) -> list[str]:
    """Collection ids a dataset is linked to, oldest link first."""
    client = _get_client()
    try:
        response = (
            client.schema("pdqe")
            .table("dataset_collections")
            .select("collection_id")
            .eq("dataset_id", dataset_id)
            .order("linked_at")
            .execute()
        )
    except APIError as exc:
        raise ValueError(f"Collections for dataset {dataset_id} could not be loaded: {exc}") from exc
    return [str(r["collection_id"]) for r in (response.data or [])]


def fetch_endpoint(endpoint_id: str) -> dict:
    """Load a pdqe.endpoints row. Raises ValueError if it does not exist."""
    return _fetch_one("endpoints", _ENDPOINT_COLUMNS, "endpoint_id", endpoint_id, "Endpoint")


def fetch_endpoint_for_dataset(dataset_id: str) -> Optional[dict]:
    """The endpoint generated for a dataset, or None (UNIQUE on dataset_id)."""
    client = _get_client()
    try:
        response = (
            client.schema("pdqe")
            .table("endpoints")
            .select(_ENDPOINT_COLUMNS)
            .eq("dataset_id", dataset_id)
            .limit(1)
            .execute()
        )
    except APIError as exc:
        raise ValueError(f"Endpoint for dataset {dataset_id} could not be loaded: {exc}") from exc
    return response.data[0] if response.data else None


def insert_endpoint(row: dict) -> dict:
    """Insert into pdqe.endpoints. The insert trigger re-checks provenance and forces DRAFT."""
    return _insert("endpoints", row, f"Endpoint for dataset {row.get('dataset_id')}")


def list_endpoints(status: Optional[str] = None, limit: int = MAX_LIST_PAGE) -> list[dict]:
    """Endpoints, newest first, optionally filtered by status."""
    client = _get_client()
    query = client.schema("pdqe").table("endpoints").select(_ENDPOINT_COLUMNS)
    if status is not None:
        query = query.eq("status", status)
    try:
        response = query.order("generated_at", desc=True).limit(min(limit, MAX_LIST_PAGE)).execute()
    except APIError as exc:
        raise ValueError(f"Endpoints could not be listed: {exc}") from exc
    return response.data or []


def call_transition(source_id: str, endpoint_id: str) -> None:
    """Advance the source COLLECTION_LINKED → ENDPOINT_GENERATED."""
    client = _get_client()
    try:
        client.schema("pdqe").rpc(
            TRANSITION_ENDPOINT_GENERATED,
            {"p_source_id": source_id, "p_endpoint_id": endpoint_id},
        ).execute()
    except APIError as exc:
        raise ValueError(f"{TRANSITION_ENDPOINT_GENERATED} refused for source {source_id}: {exc}") from exc
    logger.info("%s: source %s endpoint %s", TRANSITION_ENDPOINT_GENERATED, source_id, endpoint_id)
