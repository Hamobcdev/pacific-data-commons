"""
PDQE Stage 07 — Dataset and Collection Schemas.

SOURCE, DATASET and COLLECTION are distinct objects (migration
20261012000003). A dataset carries the full provenance of the sources and
extractions it was derived from; a collection only groups datasets.

P9 (CLAUDE.md): every input is untrusted data — API bodies and rows read back
from Supabase alike — and is validated here before any DB write or state
transition. extra="forbid" on every model. Cross-field provenance invariants
mirror the CHECK constraints on pdqe.datasets.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.qualification.schemas import DomainClassification
from app.review.schemas import LicenceStatus

# Bounds on free-text and caller-supplied structures — long enough for real
# metadata, short enough that the endpoints can't be used to stuff the DB.
MAX_TITLE_CHARS = 500
MAX_DESCRIPTION_CHARS = 4000
MAX_TIME_PERIOD_CHARS = 64
MAX_URL_CHARS = 2048
MAX_GEOGRAPHY_ITEMS = 100
MAX_GEOGRAPHY_ITEM_CHARS = 100
MAX_METADATA_BYTES = 16_384

_SHA256_PATTERN = r"^[0-9a-f]{64}$"

DatasetLifecycleState = Literal["DATASET_CREATED", "COLLECTION_LINKED"]


def _clean_geography(values: list[str]) -> list[str]:
    """Strip, drop blanks, de-duplicate (order kept), enforce bounds."""
    if len(values) > MAX_GEOGRAPHY_ITEMS:
        raise ValueError(f"geography_scope may hold at most {MAX_GEOGRAPHY_ITEMS} entries")
    cleaned: list[str] = []
    for value in values:
        item = value.strip()
        if not item:
            continue
        if len(item) > MAX_GEOGRAPHY_ITEM_CHARS:
            raise ValueError(f"geography_scope entries must be at most {MAX_GEOGRAPHY_ITEM_CHARS} chars")
        if item not in cleaned:
            cleaned.append(item)
    return cleaned


def _check_metadata(value: dict) -> dict:
    """Metadata must be a JSON-serialisable object within the size bound."""
    try:
        encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"metadata must be JSON-serialisable: {exc}") from exc
    if len(encoded.encode("utf-8")) > MAX_METADATA_BYTES:
        raise ValueError(f"metadata must be at most {MAX_METADATA_BYTES} bytes when serialised")
    return value


def _check_licence_url(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    url = value.strip()
    if not url:
        return None
    if not url.lower().startswith(("https://", "http://")):
        raise ValueError("licence_url must be an http(s) URL")
    return url


def _strip_required(value: str, field: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError(f"{field} must not be blank")
    return stripped


# ── Dataset ───────────────────────────────────────────────────────────────────

class DatasetCreate(BaseModel):
    """
    Descriptive fields for a dataset created from an approved source.

    Optional request body for POST /dataset/create/{source_id}: when supplied,
    these values replace the ones derived from the source/extraction. The
    provenance fields (source_ids, extraction_ids, domain, licence_status) are
    never caller-supplied — they are always derived by app.dataset.builder.
    """

    model_config = ConfigDict(extra="forbid")

    source_id: UUID
    title: str = Field(min_length=1, max_length=MAX_TITLE_CHARS)
    description: Optional[str] = Field(default=None, max_length=MAX_DESCRIPTION_CHARS)
    geography_scope: list[str] = Field(default_factory=list)
    time_period_start: Optional[str] = Field(default=None, max_length=MAX_TIME_PERIOD_CHARS)
    time_period_end: Optional[str] = Field(default=None, max_length=MAX_TIME_PERIOD_CHARS)
    licence_url: Optional[str] = Field(default=None, max_length=MAX_URL_CHARS)
    metadata: dict = Field(default_factory=dict)

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        return _strip_required(value, "title")

    @field_validator("geography_scope")
    @classmethod
    def _geography(cls, value: list[str]) -> list[str]:
        return _clean_geography(value)

    @field_validator("licence_url")
    @classmethod
    def _licence_url(cls, value: Optional[str]) -> Optional[str]:
        return _check_licence_url(value)

    @field_validator("metadata")
    @classmethod
    def _metadata(cls, value: dict) -> dict:
        return _check_metadata(value)


class _DatasetProvenance(BaseModel):
    """Fields and invariants shared by a draft and a stored dataset."""

    model_config = ConfigDict(extra="forbid")

    source_ids: list[UUID] = Field(min_length=1)
    primary_source_id: UUID
    extraction_ids: list[UUID] = Field(min_length=1)
    domain: DomainClassification
    title: str = Field(min_length=1, max_length=MAX_TITLE_CHARS)
    description: Optional[str] = None
    geography_scope: list[str] = Field(default_factory=list)
    time_period_start: Optional[str] = None
    time_period_end: Optional[str] = None
    licence_status: LicenceStatus
    licence_url: Optional[str] = None
    dataset_hash: str = Field(pattern=_SHA256_PATTERN)
    metadata: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_provenance(self):
        if self.primary_source_id not in self.source_ids:
            raise ValueError("primary_source_id must be included in source_ids")
        if len(set(self.source_ids)) != len(self.source_ids):
            raise ValueError("duplicate id in source_ids")
        if len(set(self.extraction_ids)) != len(self.extraction_ids):
            raise ValueError("duplicate id in extraction_ids")
        if self.licence_status in (LicenceStatus.EXCLUDED, LicenceStatus.UNKNOWN):
            raise ValueError(
                f"licence_status {self.licence_status.value} cannot back a dataset "
                "(UNKNOWN is not approval; EXCLUDED is permanent)"
            )
        return self


class DatasetDraft(_DatasetProvenance):
    """
    A fully derived dataset ready to insert — output of build_dataset().
    Everything pdqe.datasets needs except the DB-assigned id, version and
    timestamps.
    """


class DatasetRecord(_DatasetProvenance):
    """Full pdqe.datasets row as returned from the DB."""

    dataset_id: UUID
    version: int = Field(ge=1)
    lifecycle_state: DatasetLifecycleState
    created_at: datetime
    updated_at: datetime


# ── Collection ────────────────────────────────────────────────────────────────

class CollectionCreate(BaseModel):
    """Request body for POST /collection/create. P9 validated."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=MAX_TITLE_CHARS)
    description: Optional[str] = Field(default=None, max_length=MAX_DESCRIPTION_CHARS)
    domain: DomainClassification
    geography_scope: list[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, value: str) -> str:
        return _strip_required(value, "name")

    @field_validator("geography_scope")
    @classmethod
    def _geography(cls, value: list[str]) -> list[str]:
        return _clean_geography(value)


class CollectionRecord(BaseModel):
    """Full pdqe.collections row as returned from the DB."""

    model_config = ConfigDict(extra="forbid")

    collection_id: UUID
    name: str = Field(min_length=1)
    description: Optional[str] = None
    domain: DomainClassification
    geography_scope: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class DatasetCollectionLink(BaseModel):
    """Result of linking a dataset to a collection."""

    model_config = ConfigDict(extra="forbid")

    dataset_id: UUID
    collection_id: UUID
    linked_at: datetime
