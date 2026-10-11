"""
PDQE Stage 07 — Dataset and Collection manager.

Creates datasets from approved sources, creates collections, and links the
two, advancing the source lifecycle:

  APPROVED → DATASET_CREATED → COLLECTION_LINKED

Retry safety: the dataset insert and its transition RPC are two calls. If the
RPC fails after the insert succeeded, a retry finds the existing dataset with
the same dataset_hash (the source is still APPROVED) and re-runs only the
transition — it does not mint a spurious new version. Linking is idempotent
the same way: the link insert is ON CONFLICT DO NOTHING and the transition
only runs while the dataset is still DATASET_CREATED.

P9: every row read back from Supabase is re-parsed through the strict
record schemas before it is returned.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from pydantic import ValidationError

from app.dataset import supabase_client as db
from app.dataset.builder import build_dataset
from app.dataset.schemas import (
    CollectionCreate,
    CollectionRecord,
    DatasetCollectionLink,
    DatasetCreate,
    DatasetRecord,
)

logger = logging.getLogger(__name__)


def _to_dataset(row: dict) -> DatasetRecord:
    try:
        return DatasetRecord.model_validate(row)
    except ValidationError as exc:
        raise ValueError(f"Dataset row {row.get('dataset_id')} failed schema validation: {exc}") from exc


def _to_collection(row: dict) -> CollectionRecord:
    try:
        return CollectionRecord.model_validate(row)
    except ValidationError as exc:
        raise ValueError(f"Collection row {row.get('collection_id')} failed schema validation: {exc}") from exc


def _to_link(row: dict) -> DatasetCollectionLink:
    try:
        return DatasetCollectionLink.model_validate(row)
    except ValidationError as exc:
        raise ValueError(f"Dataset-collection link failed schema validation: {exc}") from exc


# ── Datasets ──────────────────────────────────────────────────────────────────

def create_dataset(
    source_id: UUID,
    write_to_db: bool = True,
    overrides: Optional[DatasetCreate] = None,
) -> DatasetRecord:
    """
    Create a dataset from an APPROVED source and advance it to DATASET_CREATED.

    The version is 1 for a source's first dataset and max(existing) + 1
    thereafter. With write_to_db=False nothing is written; the returned record
    shows the dataset as it would be stored (with a provisional dataset_id).
    """
    sid = str(source_id)
    draft = build_dataset(source_id, overrides)

    existing = [_to_dataset(row) for row in db.list_datasets_for_source(sid)]

    # Retry after a failed transition: same content, source still APPROVED.
    for record in existing:
        if record.dataset_hash == draft.dataset_hash:
            if write_to_db:
                logger.info(
                    "Dataset %s already exists for source %s with identical hash — re-running transition",
                    record.dataset_id, sid,
                )
                db.call_transition(db.TRANSITION_DATASET_CREATED, sid, str(record.dataset_id))
            return record

    version = max((r.version for r in existing), default=0) + 1
    row = draft.model_dump(mode="json")
    row["version"] = version

    if not write_to_db:
        now = datetime.now(timezone.utc)
        return _to_dataset(
            {
                **row,
                "dataset_id": str(uuid.uuid4()),
                "lifecycle_state": "DATASET_CREATED",
                "created_at": now,
                "updated_at": now,
            }
        )

    inserted = _to_dataset(db.insert_dataset(row))
    db.call_transition(db.TRANSITION_DATASET_CREATED, sid, str(inserted.dataset_id))
    logger.info("Dataset %s v%d created for source %s", inserted.dataset_id, version, sid)
    return inserted


def get_dataset(dataset_id: UUID) -> DatasetRecord:
    """Load one dataset. Raises ValueError if it does not exist."""
    return _to_dataset(db.fetch_dataset(str(dataset_id)))


# ── Collections ───────────────────────────────────────────────────────────────

def create_collection(input: CollectionCreate, write_to_db: bool = True) -> CollectionRecord:  # noqa: A002
    """
    Create a thematic / domain collection. A duplicate name is refused by the
    DB (UNIQUE) and surfaces as ValueError.
    """
    # P9: re-validate even when handed a model instance — it may have been
    # built with model_construct() and never checked.
    payload = CollectionCreate.model_validate(input.model_dump())
    row = payload.model_dump(mode="json")

    if not write_to_db:
        now = datetime.now(timezone.utc)
        return _to_collection(
            {**row, "collection_id": str(uuid.uuid4()), "created_at": now, "updated_at": now}
        )

    record = _to_collection(db.insert_collection(row))
    logger.info("Collection %s created: %s", record.collection_id, record.name)
    return record


def list_collection_datasets(collection_id: UUID) -> list[DatasetRecord]:
    """Datasets linked to a collection. Raises ValueError if the collection does not exist."""
    cid = str(collection_id)
    db.fetch_collection(cid)
    ids = db.list_collection_dataset_ids(cid)
    return [_to_dataset(row) for row in db.fetch_datasets(ids)]


# ── Linking ───────────────────────────────────────────────────────────────────

def link_dataset_to_collection(
    dataset_id: UUID,
    collection_id: UUID,
    write_to_db: bool = True,
) -> DatasetCollectionLink:
    """
    Link a dataset to a collection (idempotent). The first link advances the
    dataset's primary source DATASET_CREATED → COLLECTION_LINKED; further
    links to other collections only add the grouping.
    """
    dataset = get_dataset(dataset_id)
    collection = _to_collection(db.fetch_collection(str(collection_id)))

    if not write_to_db:
        return DatasetCollectionLink(
            dataset_id=dataset.dataset_id,
            collection_id=collection.collection_id,
            linked_at=datetime.now(timezone.utc),
        )

    link = _to_link(db.insert_link(str(dataset.dataset_id), str(collection.collection_id)))

    if dataset.lifecycle_state == "DATASET_CREATED":
        db.call_transition(
            db.TRANSITION_COLLECTION_LINKED,
            str(dataset.primary_source_id),
            str(dataset.dataset_id),
        )

    logger.info("Dataset %s linked to collection %s", dataset.dataset_id, collection.collection_id)
    return link
