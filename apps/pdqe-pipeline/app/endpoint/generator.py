"""
PDQE Stage 08 — Endpoint Generator.

Builds an EndpointSpec from a collection-linked dataset and advances the
source COLLECTION_LINKED → ENDPOINT_GENERATED.

Never executes model output. No model is called at all in Stage 08: the
title and description come from the human-approved dataset, and path,
parameters, response schema, pricing tier, provenance and the integrity hash
are assigned by deterministic code (app.endpoint.templates). The spec is a
data structure only.

Generation is NOT publication: the row is inserted as DRAFT (the DB forces
it) and must pass Stage 09 before it is ever PUBLISHED or x402-queryable.

Retry safety: the endpoint insert and its transition RPC are two calls. If
the RPC fails after the insert succeeded, a retry finds the existing
endpoint for the dataset (UNIQUE on dataset_id) while the source is still
COLLECTION_LINKED and re-runs only the transition.

P9: every row read from Supabase is re-parsed through the strict schemas.
"""

from __future__ import annotations

import hashlib
import logging
import re
import unicodedata
import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from pydantic import ValidationError

from app.dataset.builder import canonical_json
from app.dataset.schemas import DatasetRecord
from app.endpoint import supabase_client as db
from app.endpoint.schemas import (
    TIER_PRICES,
    EndpointRecord,
    EndpointSpec,
    EndpointStatus,
)
from app.endpoint.templates import (
    assign_pricing_tier,
    build_query_examples,
    get_default_parameters,
    get_default_response_schema,
    get_path_template,
)

logger = logging.getLogger(__name__)

# Bumped whenever the hashed fields or their canonical form change — stored
# inside the hashed payload so a hash always names its own recipe.
ENDPOINT_HASH_VERSION = "pdqe-endpoint-hash-v1"

MAX_SLUG_CHARS = 64
# Room for "-" + 8 hex chars of the dataset id, which keeps paths unique
# when two datasets share a title.
_SLUG_SUFFIX_CHARS = 9
_COLLECTION_LINKED = "COLLECTION_LINKED"

_HASHED_FIELDS = frozenset(EndpointSpec.model_fields) - {"endpoint_hash"}


# ── Slug and hash ─────────────────────────────────────────────────────────────

def slugify(text: str, max_length: int = MAX_SLUG_CHARS) -> str:
    """
    Convert a title to a URL-safe slug: ASCII lowercase letters, digits and
    single hyphens, no leading/trailing hyphen, at most max_length chars.
    Returns "" when nothing usable remains.
    """
    normalised = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", normalised.lower()).strip("-")
    return slug[:max_length].rstrip("-")


def build_slug(title: str, dataset_id: UUID) -> str:
    """Deterministic, unique-per-dataset slug: slugified title + 8 hex of the dataset id."""
    suffix = UUID(str(dataset_id)).hex[:8]
    base = slugify(title, MAX_SLUG_CHARS - _SLUG_SUFFIX_CHARS) or "dataset"
    return f"{base}-{suffix}"


def _hash_payload(spec: EndpointSpec | EndpointRecord) -> dict[str, Any]:
    payload = spec.model_dump(mode="json", include=set(_HASHED_FIELDS))
    # Fixed scale so 0.01 and 0.0100 (NUMERIC(10,4) read-back) hash alike.
    payload["price_usdc"] = f"{spec.price_usdc:.4f}"
    payload["provenance_source_ids"] = sorted(payload["provenance_source_ids"])
    payload["hash_version"] = ENDPOINT_HASH_VERSION
    return payload


def compute_endpoint_hash(spec: EndpointSpec | EndpointRecord) -> str:
    """SHA-256 of the canonical JSON of the spec (sort_keys, no whitespace), excluding the hash itself."""
    return hashlib.sha256(canonical_json(_hash_payload(spec)).encode("utf-8")).hexdigest()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_record(row: dict) -> EndpointRecord:
    try:
        return EndpointRecord.model_validate(row)
    except ValidationError as exc:
        raise ValueError(f"Endpoint row {row.get('endpoint_id')} failed schema validation: {exc}") from exc


def _load_dataset(dataset_id: UUID) -> DatasetRecord:
    row = db.fetch_dataset(str(dataset_id))
    try:
        return DatasetRecord.model_validate(row)
    except ValidationError as exc:
        raise ValueError(f"Dataset row {dataset_id} failed schema validation: {exc}") from exc


def _description(dataset: DatasetRecord) -> str:
    text = (dataset.description or "").strip()
    if text:
        return text
    geography = ", ".join(dataset.geography_scope) if dataset.geography_scope else "the Pacific"
    return f"{dataset.title} — {dataset.domain.value.lower()} data for {geography} (PDQE dataset v{dataset.version})."


def build_spec(
    dataset: DatasetRecord,
    assessment: dict,
    source: dict,
    collection_id: Optional[UUID],
) -> EndpointSpec:
    """Assemble and P9-validate the spec for a dataset. Pure — no DB access."""
    dataset_dict = dataset.model_dump(mode="json")
    tier, cultural = assign_pricing_tier(dataset_dict, assessment, source)

    slug = build_slug(dataset.title, dataset.dataset_id)
    path = get_path_template(dataset.domain, slug)
    parameters = get_default_parameters(dataset.domain)

    fields: dict[str, Any] = {
        "dataset_id": dataset.dataset_id,
        "collection_id": collection_id,
        "path": path,
        "slug": slug,
        "title": dataset.title,
        "description": _description(dataset),
        "domain": dataset.domain,
        "pricing_tier": tier,
        "price_usdc": TIER_PRICES[tier],
        "cultural_sovereignty": cultural,
        "response_schema": get_default_response_schema(dataset.domain),
        "parameters": parameters,
        "query_examples": build_query_examples(path, parameters, dataset_dict),
        "provenance_dataset_id": dataset.dataset_id,
        "provenance_source_ids": list(dataset.source_ids),
    }
    try:
        # Validate everything except the hash, then hash the validated form.
        draft = EndpointSpec.model_validate({**fields, "endpoint_hash": "0" * 64})
        return EndpointSpec.model_validate(
            {**draft.model_dump(), "endpoint_hash": compute_endpoint_hash(draft)}
        )
    except ValidationError as exc:
        raise ValueError(f"Endpoint spec for dataset {dataset.dataset_id} failed schema validation: {exc}") from exc


# ── Entry points ──────────────────────────────────────────────────────────────

def generate_endpoint(
    dataset_id: UUID,
    collection_id: Optional[UUID] = None,
    write_to_db: bool = True,
) -> EndpointRecord:
    """
    Generate the endpoint spec for a COLLECTION_LINKED dataset, store it as
    DRAFT and advance its primary source to ENDPOINT_GENERATED.

    collection_id selects the primary collection; it must be one the dataset
    is linked to. Defaults to the dataset's first-linked collection.

    With write_to_db=False nothing is written; the returned record shows the
    endpoint as it would be stored (with a provisional endpoint_id).

    Raises ValueError when the dataset/source is missing or not
    COLLECTION_LINKED, the collection is not linked, the dataset already has
    an endpoint, or the spec fails validation.
    """
    dataset = _load_dataset(dataset_id)
    did = str(dataset.dataset_id)
    sid = str(dataset.primary_source_id)

    if dataset.lifecycle_state != _COLLECTION_LINKED:
        raise ValueError(
            f"Dataset {did} is in state '{dataset.lifecycle_state}', Stage 08 requires COLLECTION_LINKED"
        )

    source = db.fetch_source(sid)
    source_state = source.get("lifecycle_state")

    existing = db.fetch_endpoint_for_dataset(did)
    if existing is not None:
        record = _to_record(existing)
        if source_state == _COLLECTION_LINKED and write_to_db:
            # Retry after a failed transition.
            logger.info("Endpoint %s already exists for dataset %s — re-running transition", record.endpoint_id, did)
            db.call_transition(sid, str(record.endpoint_id))
            return record
        raise ValueError(f"Dataset {did} already has endpoint {record.endpoint_id} ({record.path})")

    if source_state != _COLLECTION_LINKED:
        raise ValueError(f"Source {sid} is in state '{source_state}', Stage 08 requires COLLECTION_LINKED")

    linked = db.list_dataset_collection_ids(did)
    if not linked:
        raise ValueError(f"Dataset {did} is not linked to any collection")
    if collection_id is not None and str(collection_id) not in linked:
        raise ValueError(f"Dataset {did} is not linked to collection {collection_id}")
    primary_collection = UUID(str(collection_id)) if collection_id is not None else UUID(linked[0])

    # Pricing reads the assessment the approving validation actually ran against.
    validation = db.fetch_latest_validation(sid)
    assessment = db.fetch_assessment(str(validation["assessment_id"]))
    if str(assessment.get("source_id")) != sid:
        raise ValueError(f"Assessment {assessment.get('id')} does not belong to source {sid}")

    spec = build_spec(dataset, assessment, source, primary_collection)
    row = spec.model_dump(mode="json")

    if not write_to_db:
        now = datetime.now(timezone.utc)
        return _to_record(
            {
                **row,
                "endpoint_id": str(uuid.uuid4()),
                "provider_wallet": None,
                "status": EndpointStatus.DRAFT.value,
                "generated_at": now,
                "updated_at": now,
            }
        )

    inserted = _to_record(db.insert_endpoint(row))
    if inserted.status != EndpointStatus.DRAFT:
        raise RuntimeError(f"Endpoint {inserted.endpoint_id} was stored as {inserted.status.value}, expected DRAFT")
    if inserted.endpoint_hash != spec.endpoint_hash or compute_endpoint_hash(inserted) != spec.endpoint_hash:
        raise RuntimeError(f"Endpoint {inserted.endpoint_id} read back with a different spec than was generated")

    db.call_transition(sid, str(inserted.endpoint_id))
    logger.info(
        "Endpoint %s generated for dataset %s at %s (%s, DRAFT)",
        inserted.endpoint_id, did, inserted.path, inserted.pricing_tier.value,
    )
    return inserted


def get_endpoint(endpoint_id: UUID) -> EndpointRecord:
    """Load one endpoint. Raises ValueError if it does not exist."""
    return _to_record(db.fetch_endpoint(str(endpoint_id)))


def list_endpoints(status: Optional[EndpointStatus] = None, limit: int = db.MAX_LIST_PAGE) -> list[EndpointRecord]:
    """Endpoints, newest first, optionally filtered by status."""
    rows = db.list_endpoints(status.value if status is not None else None, limit)
    return [_to_record(row) for row in rows]
