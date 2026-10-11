"""
PDQE Stage 10 — Internal Dogfooding schemas.

P9 (CLAUDE.md): corpus seed files, API bodies, pipeline step responses and
rows read back from pdqe.dogfood_runs are all untrusted data and are
validated here before use.

Corpus vs domain: the five Stage 10 corpora are FISHERIES, CLIMATE, TRADE,
TOURISM and HEALTH. Each maps to the DomainClassification of the same name
(TOURISM was added in Stage 10.1, migration 20261012000008; before that tourism
seeds were classified ECONOMICS). A run records both the corpus that ran and
its primary domain (see CORPUS_PRIMARY_DOMAIN). ECONOMICS remains an accepted
alias for the trade corpus.
"""

from __future__ import annotations

import re
from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.endpoint.schemas import EndpointStatus
from app.qualification.schemas import DomainClassification, RoutingDecision
from app.review.schemas import LicenceStatus
from app.validation.schemas import ValidationOutcome

MAX_TITLE_CHARS = 500
MAX_TEXT_CHARS = 4000
MAX_URL_CHARS = 2048
MAX_GEOGRAPHY_ITEMS = 50
MAX_SOURCES_PER_RUN = 100
MAX_ERROR_CHARS = 500
MAX_RUN_LABEL_CHARS = 200

# ISO 3166-1 alpha-3 (matches pdqe.sources.geographic_scope) or a region tag.
_GEOGRAPHY_PATTERN = re.compile(r"^(?:[A-Z]{3}|PACIFIC|GLOBAL)$")
_RUN_LABEL_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._:-]*$")


class Corpus(str, Enum):
    FISHERIES = "FISHERIES"
    CLIMATE = "CLIMATE"
    TRADE = "TRADE"
    TOURISM = "TOURISM"
    HEALTH = "HEALTH"


# Accepted DogfoodRunInput.domain values → corpus. ECONOMICS is an alias for
# the trade corpus (trade flows are the economics series PDQE dogfoods).
CORPUS_ALIASES: dict[str, Corpus] = {
    "FISHERIES": Corpus.FISHERIES,
    "CLIMATE": Corpus.CLIMATE,
    "TRADE": Corpus.TRADE,
    "ECONOMICS": Corpus.TRADE,
    "TOURISM": Corpus.TOURISM,
    "HEALTH": Corpus.HEALTH,
}

# Every seed in a corpus must carry this domain classification.
CORPUS_PRIMARY_DOMAIN: dict[Corpus, DomainClassification] = {
    Corpus.FISHERIES: DomainClassification.FISHERIES,
    Corpus.CLIMATE: DomainClassification.CLIMATE,
    Corpus.TRADE: DomainClassification.TRADE,
    Corpus.TOURISM: DomainClassification.TOURISM,
    Corpus.HEALTH: DomainClassification.HEALTH,
}


def resolve_corpus(value: str) -> Corpus:
    """Map a domain/corpus name to its corpus. ValueError if unknown."""
    key = value.strip().upper() if isinstance(value, str) else ""
    corpus = CORPUS_ALIASES.get(key)
    if corpus is None:
        raise ValueError(
            f"unknown dogfood domain {value!r}; expected one of {sorted(CORPUS_ALIASES)}"
        )
    return corpus


def _check_url(value: Optional[str], field: str) -> Optional[str]:
    if value is None:
        return None
    url = value.strip()
    if not url.lower().startswith(("https://", "http://")):
        raise ValueError(f"{field} must be an http(s) URL")
    if len(url) > MAX_URL_CHARS:
        raise ValueError(f"{field} must be at most {MAX_URL_CHARS} chars")
    return url


# ── Seed sources ──────────────────────────────────────────────────────────────

class SeedSource(BaseModel):
    """One seed source definition from a corpus JSON file. Metadata only — no data."""

    model_config = ConfigDict(extra="forbid")

    source_url: str
    title: str = Field(min_length=3, max_length=MAX_TITLE_CHARS)
    description: Optional[str] = Field(default=None, max_length=MAX_TEXT_CHARS)
    domain: DomainClassification
    geography_scope: list[str] = Field(default_factory=list, max_length=MAX_GEOGRAPHY_ITEMS)
    # UNKNOWN is valid — it routes to human review; it is never treated as CLEAR.
    licence_status: LicenceStatus
    licence_url: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=MAX_TEXT_CHARS)

    @field_validator("source_url")
    @classmethod
    def _source_url(cls, value: str) -> str:
        return _check_url(value, "source_url")  # type: ignore[return-value]

    @field_validator("licence_url")
    @classmethod
    def _licence_url(cls, value: Optional[str]) -> Optional[str]:
        return _check_url(value, "licence_url")

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        if len(value.strip()) < 3:
            raise ValueError("title must be at least 3 non-blank chars")
        return value.strip()

    @field_validator("domain")
    @classmethod
    def _domain(cls, value: DomainClassification) -> DomainClassification:
        if value == DomainClassification.NONE_OF_THE_ABOVE:
            raise ValueError("NONE_OF_THE_ABOVE is a Jev answer, not a seed domain")
        return value

    @field_validator("geography_scope")
    @classmethod
    def _geography(cls, values: list[str]) -> list[str]:
        for item in values:
            if not _GEOGRAPHY_PATTERN.match(item):
                raise ValueError(
                    f"geography_scope entry {item!r} must be an ISO 3166-1 alpha-3 code, PACIFIC or GLOBAL"
                )
        if len(values) != len(set(values)):
            raise ValueError("geography_scope must not contain duplicates")
        return values


# ── Run outcomes and report ───────────────────────────────────────────────────

class RunOutcome(str, Enum):
    SUCCESS = "SUCCESS"
    FAILED_INGESTION = "FAILED_INGESTION"
    FAILED_EXTRACTION = "FAILED_EXTRACTION"
    FAILED_QUALIFICATION = "FAILED_QUALIFICATION"
    FAILED_VALIDATION = "FAILED_VALIDATION"
    FAILED_DATASET = "FAILED_DATASET"
    FAILED_ENDPOINT = "FAILED_ENDPOINT"
    ROUTED_TO_REVIEW = "ROUTED_TO_REVIEW"
    LICENCE_BLOCKED = "LICENCE_BLOCKED"
    DRY_RUN_PASS = "DRY_RUN_PASS"
    # Idempotent resume (re-runs): the source was already handled by an earlier
    # run. Counted separately — neither a success nor a failure of this run.
    ALREADY_PROCESSED = "ALREADY_PROCESSED"  # EXTRACTED or later already
    SKIPPED_PREVIOUSLY_REJECTED = "SKIPPED_PREVIOUSLY_REJECTED"  # REJECTED / QUARANTINED
    # The URL's content no longer matches the hash an earlier run recorded:
    # the source needs a declared dataset update (Decision 54), not a resume.
    CONTENT_CHANGED = "CONTENT_CHANGED"


SUCCEEDED_OUTCOMES = frozenset({RunOutcome.SUCCESS, RunOutcome.DRY_RUN_PASS})
# CONTENT_CHANGED waits on a human declaring the update, so it is review work.
REVIEW_OUTCOMES = frozenset({RunOutcome.ROUTED_TO_REVIEW, RunOutcome.CONTENT_CHANGED})
SKIPPED_OUTCOMES = frozenset({RunOutcome.ALREADY_PROCESSED, RunOutcome.SKIPPED_PREVIOUSLY_REJECTED})


class SourceRunResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_url: str
    title: str
    domain: DomainClassification
    outcome: RunOutcome
    stage_reached: str  # last stage completed before failure/review
    licence_status: Optional[LicenceStatus] = None
    error: Optional[str] = Field(default=None, max_length=MAX_ERROR_CHARS)
    source_id: Optional[UUID] = None  # set if the source was registered


class AutoApprovedSource(BaseModel):
    """One source that bypassed the human approval gate in a dogfood run."""

    model_config = ConfigDict(extra="forbid")

    source_id: UUID
    source_url: str
    title: str
    domain: DomainClassification
    licence_status: LicenceStatus


class DogfoodRunReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_label: str
    domain: str  # the domain/corpus name the caller asked for
    corpus: Corpus
    dry_run: bool
    sources_attempted: int = Field(ge=0)
    sources_succeeded: int = Field(ge=0)
    sources_failed: int = Field(ge=0)
    sources_routed_to_review: int = Field(ge=0)
    sources_already_processed: int = Field(default=0, ge=0)
    sources_skipped_previously_rejected: int = Field(default=0, ge=0)
    results: list[SourceRunResult]
    failure_modes: list[dict]
    licence_outcomes: dict[str, int]
    started_at: datetime
    completed_at: Optional[datetime] = None
    run_id: Optional[UUID] = None  # set once the report is recorded in pdqe.dogfood_runs
    # Sources whose human approval gate was bypassed by DOGFOOD_AUTO_APPROVE.
    # Non-empty means manual follow-up is required before any of their
    # endpoints can be published. Stored in pdqe.dogfood_runs.run_report.
    auto_approved_sources: list[AutoApprovedSource] = Field(default_factory=list)

    @model_validator(mode="after")
    def _counts(self) -> "DogfoodRunReport":
        if self.sources_attempted != len(self.results):
            raise ValueError("sources_attempted must equal the number of results")
        if self.sources_attempted != (
            self.sources_succeeded
            + self.sources_failed
            + self.sources_routed_to_review
            + self.sources_already_processed
            + self.sources_skipped_previously_rejected
        ):
            raise ValueError(
                "succeeded + failed + routed_to_review + already_processed + "
                "skipped_previously_rejected must equal attempted"
            )
        if sum(self.licence_outcomes.values()) != self.sources_attempted:
            raise ValueError("licence_outcomes must count every attempted source")
        return self


class DogfoodRunInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    domain: str  # FISHERIES|CLIMATE|TRADE (alias ECONOMICS)|TOURISM|HEALTH
    dry_run: bool = True  # default True — never writes pipeline rows unless explicitly False
    run_label: Optional[str] = Field(default=None, max_length=MAX_RUN_LABEL_CHARS)
    max_sources: Optional[int] = Field(default=None, ge=1, le=MAX_SOURCES_PER_RUN)
    # Record the run report in pdqe.dogfood_runs. Off by default so a call
    # has no side effects unless the caller asks for one.
    record_run: bool = False

    @field_validator("domain")
    @classmethod
    def _domain(cls, value: str) -> str:
        resolve_corpus(value)  # raises on an unknown name → HTTP 422
        return value.strip().upper()

    @field_validator("run_label")
    @classmethod
    def _run_label(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        label = value.strip()
        if not label or not _RUN_LABEL_PATTERN.match(label):
            raise ValueError("run_label may contain only letters, digits, spaces and . _ : -")
        return label


# ── Pipeline step responses (P9 projections) ──────────────────────────────────
# The runner reads only these fields from each step's response; each is
# validated before use. extra="ignore" because they are projections of the
# full Stage 01–08 response models.

class _Projection(BaseModel):
    model_config = ConfigDict(extra="ignore")


class RegisteredSource(_Projection):
    source_id: UUID


class ResumeAction(str, Enum):
    """What an earlier run left behind for a source (idempotent resume)."""

    NEW = "NEW"  # nothing usable — register, fetch and run Layer 1 + Layer 2
    # Pre-INGESTED partial of the same URL — claim its row; fetch, Layer 1 and
    # Layer 2 still run on it before anything else (P9).
    CLAIM_PARTIAL = "CLAIM_PARTIAL"
    RESUME_EXTRACTION = "RESUME_EXTRACTION"  # INGESTED — continue on the existing source
    ALREADY_PROCESSED = "ALREADY_PROCESSED"  # EXTRACTED or later — nothing to do
    SKIPPED_PREVIOUSLY_REJECTED = "SKIPPED_PREVIOUSLY_REJECTED"  # REJECTED / QUARANTINED
    # Ingestion responses only: fresh Layer 2 hash ≠ the source's recorded hash.
    CONTENT_CHANGED = "CONTENT_CHANGED"


class ExistingSource(_Projection):
    """find_existing_source response: the resume decision for one seed URL."""

    action: ResumeAction
    source_id: Optional[UUID] = None
    lifecycle_state: Optional[str] = None
    reason: Optional[str] = None

    @model_validator(mode="after")
    def _source_id_required(self) -> "ExistingSource":
        if self.action == ResumeAction.CONTENT_CHANGED:
            raise ValueError("CONTENT_CHANGED needs fresh content; it is never a pre-fetch decision")
        if self.action != ResumeAction.NEW and self.source_id is None:
            raise ValueError(f"{self.action.value} requires the existing source_id")
        return self


class IngestionStep(_Projection):
    ingestion_id: UUID
    # Set when the content hash matched an existing source: the run continues
    # on (or stops at) that source instead of the one it just registered.
    resume: ResumeAction = ResumeAction.NEW
    source_id: Optional[UUID] = None
    lifecycle_state: Optional[str] = None
    reason: Optional[str] = None

    @model_validator(mode="after")
    def _source_id_required(self) -> "IngestionStep":
        if self.resume != ResumeAction.NEW and self.source_id is None:
            raise ValueError(f"{self.resume.value} requires the existing source_id")
        return self


class ExtractionStep(_Projection):
    extraction_id: Optional[UUID] = None
    passed: bool
    status: str
    rejection_reason: Optional[str] = None
    error: Optional[str] = None


class QualificationStep(_Projection):
    routing_decision: RoutingDecision


class ValidationStep(_Projection):
    outcome: ValidationOutcome
    outcome_reason: str


class DatasetStep(_Projection):
    dataset_id: UUID


class CollectionStep(_Projection):
    collection_id: UUID


class EndpointStep(_Projection):
    endpoint_id: UUID
    status: EndpointStatus


# ── pdqe.dogfood_runs read model ──────────────────────────────────────────────

class DogfoodRunSummary(BaseModel):
    """One pdqe.dogfood_runs row without the full run_report."""

    model_config = ConfigDict(extra="forbid")

    run_id: UUID
    run_label: str
    corpus: Corpus
    domain: DomainClassification
    dry_run: bool
    sources_attempted: int = Field(ge=0)
    sources_succeeded: int = Field(ge=0)
    sources_failed: int = Field(ge=0)
    sources_routed_to_review: int = Field(ge=0)
    sources_already_processed: int = Field(default=0, ge=0)
    sources_skipped_previously_rejected: int = Field(default=0, ge=0)
    failure_modes: list[dict]
    licence_outcomes: dict[str, int]
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: str


class ReviewQueueEntry(BaseModel):
    """
    GET /dogfood/review-queue item: an auto-approved source whose licence has
    not yet been confirmed by a human (pdqe.sources.licence_confirmed_by is
    NULL). Each one needs manual licence review before publication.
    """

    model_config = ConfigDict(extra="forbid")

    run_id: UUID
    run_label: str
    source_id: UUID
    source_url: str
    title: str
    domain: DomainClassification
    licence_status: LicenceStatus
    run_started_at: datetime
