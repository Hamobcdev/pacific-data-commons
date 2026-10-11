"""
PDQE Stage 07 — Supabase client for datasets and collections.

Reads the source / validation / Jev assessment / extraction a dataset is
derived from, writes pdqe.datasets, pdqe.collections and
pdqe.dataset_collections, and advances the lifecycle via the Stage 07
transition RPCs (migration 20261012000003). All DB access uses
SUPABASE_SERVICE_KEY — same client factory as Stages 05/06.

The DB re-enforces every rule checked in Python (primary source APPROVED,
array provenance membership, licence, immutable provenance, append-only
links) — the checks here exist for clear error messages, not enforcement.
"""

from __future__ import annotations

import logging

from postgrest import APIError

from app.validation.supabase_client import _get_client

logger = logging.getLogger(__name__)

_SOURCE_COLUMNS = (
    "source_id, title, description, source_url, lifecycle_state, licence_status, "
    "licence_url, geographic_scope"
)
_VALIDATION_COLUMNS = "id, source_id, assessment_id, outcome, validated_at"
_ASSESSMENT_COLUMNS = "id, source_id, extraction_id, domain_classification"
_EXTRACTION_COLUMNS = (
    "extraction_id, source_id, status, title, geographic_scope, licence_url, "
    "contributing_ingestion_ids"
)
_DATASET_COLUMNS = (
    "dataset_id, source_ids, primary_source_id, extraction_ids, domain, title, "
    "description, geography_scope, time_period_start, time_period_end, "
    "licence_status, licence_url, version, dataset_hash, metadata, "
    "lifecycle_state, created_at, updated_at"
)
_COLLECTION_COLUMNS = (
    "collection_id, name, description, domain, geography_scope, created_at, updated_at"
)
_LINK_COLUMNS = "dataset_id, collection_id, linked_at"

TRANSITION_DATASET_CREATED = "transition_to_dataset_created"
TRANSITION_COLLECTION_LINKED = "transition_to_collection_linked"


def _fetch_one(table: str, columns: str, key: str, value: str, what: str) -> dict:
    client = _get_client()
    try:
        response = (
            client.schema("pdqe").table(table).select(columns).eq(key, value).limit(1).execute()
        )
    except APIError as exc:
        raise ValueError(f"{what} {value} could not be loaded from pdqe.{table}: {exc}") from exc
    if not response.data:
        raise ValueError(f"{what} {value} not found in pdqe.{table}")
    return response.data[0]


def _insert(table: str, row: dict, what: str) -> dict:
    client = _get_client()
    try:
        response = client.schema("pdqe").table(table).insert(row).execute()
    except APIError as exc:
        # Constraint and trigger refusals (unique name, wrong state, provenance
        # mismatch) are business-rule failures — surface them as client errors.
        raise ValueError(f"{what} could not be written to pdqe.{table}: {exc}") from exc
    if not response.data:
        raise RuntimeError(f"Supabase insert to pdqe.{table} returned no data for {what}")
    return response.data[0]


# ── Pipeline inputs ───────────────────────────────────────────────────────────

def fetch_source(source_id: str) -> dict:
    """Load a pdqe.sources row. Raises ValueError if it does not exist."""
    return _fetch_one("sources", _SOURCE_COLUMNS, "source_id", source_id, "Source")


def fetch_latest_validation(source_id: str) -> dict:
    """
    Newest pdqe.validations row for a source — the run that led to its
    approval (directly via VALIDATED, or via REVIEW + a Stage 06 decision).
    """
    client = _get_client()
    try:
        response = (
            client.schema("pdqe")
            .table("validations")
            .select(_VALIDATION_COLUMNS)
            .eq("source_id", source_id)
            .order("validated_at", desc=True)
            .limit(1)
            .execute()
        )
    except APIError as exc:
        raise ValueError(f"Validation for source {source_id} could not be loaded: {exc}") from exc
    if not response.data:
        raise ValueError(f"No validation found for source {source_id}")
    return response.data[0]


def fetch_assessment(assessment_id: str) -> dict:
    """Load the pdqe.jev_assessments row a validation was run against."""
    return _fetch_one("jev_assessments", _ASSESSMENT_COLUMNS, "id", assessment_id, "Assessment")


def fetch_extraction(extraction_id: str) -> dict:
    """Load a pdqe.extractions row by its PK."""
    return _fetch_one("extractions", _EXTRACTION_COLUMNS, "extraction_id", extraction_id, "Extraction")


def fetch_ingestion_source_ids(ingestion_ids: list[str]) -> list[str]:
    """
    Source ids of the ingestion events that contributed to an extraction —
    how a multi-document synthesis maps back to every contributing source.
    """
    if not ingestion_ids:
        return []
    client = _get_client()
    try:
        response = (
            client.schema("pdqe")
            .table("ingestion_events")
            .select("ingestion_id, source_id")
            .in_("ingestion_id", ingestion_ids)
            .execute()
        )
    except APIError as exc:
        raise ValueError(f"Contributing ingestion events could not be loaded: {exc}") from exc
    rows = response.data or []
    found = {str(r["ingestion_id"]) for r in rows}
    missing = sorted(set(ingestion_ids) - found)
    if missing:
        raise ValueError(f"Contributing ingestion events not found: {', '.join(missing)}")
    return [str(r["source_id"]) for r in rows]


# ── Datasets ──────────────────────────────────────────────────────────────────

def list_datasets_for_source(source_id: str) -> list[dict]:
    """All dataset versions whose primary source is source_id, newest first."""
    client = _get_client()
    try:
        response = (
            client.schema("pdqe")
            .table("datasets")
            .select(_DATASET_COLUMNS)
            .eq("primary_source_id", source_id)
            .order("version", desc=True)
            .execute()
        )
    except APIError as exc:
        raise ValueError(f"Datasets for source {source_id} could not be loaded: {exc}") from exc
    return response.data or []


def fetch_dataset(dataset_id: str) -> dict:
    """Load a pdqe.datasets row. Raises ValueError if it does not exist."""
    return _fetch_one("datasets", _DATASET_COLUMNS, "dataset_id", dataset_id, "Dataset")


def insert_dataset(row: dict) -> dict:
    """Insert into pdqe.datasets. The insert trigger re-checks provenance."""
    return _insert("datasets", row, f"Dataset for source {row.get('primary_source_id')}")


def fetch_datasets(dataset_ids: list[str]) -> list[dict]:
    """Load several pdqe.datasets rows, ordered by created_at."""
    if not dataset_ids:
        return []
    client = _get_client()
    response = (
        client.schema("pdqe")
        .table("datasets")
        .select(_DATASET_COLUMNS)
        .in_("dataset_id", dataset_ids)
        .order("created_at")
        .execute()
    )
    return response.data or []


# ── Collections ───────────────────────────────────────────────────────────────

def insert_collection(row: dict) -> dict:
    """Insert into pdqe.collections. A duplicate name is refused (UNIQUE)."""
    return _insert("collections", row, f"Collection '{row.get('name')}'")


def fetch_collection(collection_id: str) -> dict:
    """Load a pdqe.collections row. Raises ValueError if it does not exist."""
    return _fetch_one("collections", _COLLECTION_COLUMNS, "collection_id", collection_id, "Collection")


def insert_link(dataset_id: str, collection_id: str) -> dict:
    """
    Link a dataset to a collection — ON CONFLICT DO NOTHING, so a repeat link
    is a no-op — then return the (possibly pre-existing) link row.
    """
    client = _get_client()
    row = {"dataset_id": dataset_id, "collection_id": collection_id}
    try:
        client.schema("pdqe").table("dataset_collections").upsert(
            row, on_conflict="dataset_id,collection_id", ignore_duplicates=True
        ).execute()
        response = (
            client.schema("pdqe")
            .table("dataset_collections")
            .select(_LINK_COLUMNS)
            .eq("dataset_id", dataset_id)
            .eq("collection_id", collection_id)
            .limit(1)
            .execute()
        )
    except APIError as exc:
        raise ValueError(
            f"Dataset {dataset_id} could not be linked to collection {collection_id}: {exc}"
        ) from exc
    if not response.data:
        raise RuntimeError(f"Link {dataset_id} -> {collection_id} missing after insert")
    return response.data[0]


def list_collection_dataset_ids(collection_id: str) -> list[str]:
    """Dataset ids linked to a collection, in link order."""
    client = _get_client()
    response = (
        client.schema("pdqe")
        .table("dataset_collections")
        .select("dataset_id")
        .eq("collection_id", collection_id)
        .order("linked_at")
        .execute()
    )
    return [str(r["dataset_id"]) for r in (response.data or [])]


# ── Lifecycle ─────────────────────────────────────────────────────────────────

def call_transition(rpc_name: str, source_id: str, dataset_id: str) -> None:
    """Advance the lifecycle via a Stage 07 transition function."""
    if rpc_name not in (TRANSITION_DATASET_CREATED, TRANSITION_COLLECTION_LINKED):
        raise ValueError(f"Unknown Stage 07 transition: {rpc_name}")
    client = _get_client()
    try:
        client.schema("pdqe").rpc(
            rpc_name, {"p_source_id": source_id, "p_dataset_id": dataset_id}
        ).execute()
    except APIError as exc:
        raise ValueError(f"{rpc_name} refused for source {source_id}: {exc}") from exc
    logger.info("%s: source %s dataset %s", rpc_name, source_id, dataset_id)
