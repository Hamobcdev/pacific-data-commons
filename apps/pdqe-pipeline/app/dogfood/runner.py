"""
PDQE Stage 10 — corpus runner.

Drives each seed source of one corpus through the pipeline and records the
outcome: success, failure mode and stage, licence result, review routing.

dry_run=True (default): validates the seed sources and their licence gate
  only. Writes no pipeline rows and needs no pipeline client.
dry_run=False: runs Stage 01 registration through Stage 08 endpoint
  generation for each source via a PipelineClient. It never runs Stage 09 —
  provider approval and publication remain manual gates, so a successful
  source stops at ENDPOINT_GENERATED (endpoint DRAFT).

Licence gate (applied before any pipeline call, "unknown is not approval"):
  EXCLUDED                 → LICENCE_BLOCKED, never registered
  UNKNOWN, REVIEW_REQUIRED → registered, then ROUTED_TO_REVIEW (licence review)
  CLEAR, RESTRICTED        → full pipeline; Stage 05 validators decide the rest

The runner itself never fetches third-party data. Ingestion of source content
is the PipelineClient's job, and no client exists in this service yet — see
get_live_pipeline_client().
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Callable, Optional, Protocol, TypeVar
from uuid import UUID

from pydantic import BaseModel, ValidationError

from app.dogfood import supabase_client as db
from app.dogfood.loader import load_corpus
from app.dogfood.schemas import (
    CORPUS_PRIMARY_DOMAIN,
    REVIEW_OUTCOMES,
    SUCCEEDED_OUTCOMES,
    CollectionStep,
    Corpus,
    DatasetStep,
    DogfoodRunInput,
    DogfoodRunReport,
    EndpointStep,
    ExtractionStep,
    IngestionStep,
    MAX_ERROR_CHARS,
    QualificationStep,
    RegisteredSource,
    RunOutcome,
    SeedSource,
    SourceRunResult,
    ValidationStep,
    resolve_corpus,
)
from app.qualification.schemas import DomainClassification
from app.review.schemas import LicenceStatus
from app.validation.schemas import ValidationOutcome

logger = logging.getLogger(__name__)

_LICENCE_REVIEW = frozenset({LicenceStatus.UNKNOWN, LicenceStatus.REVIEW_REQUIRED})

T = TypeVar("T", bound=BaseModel)


class PipelineClient(Protocol):
    """
    One method per pipeline call the runner makes, in order. Each returns the
    step's JSON response as a dict (validated by the runner, P9) and raises
    on a refused or failed step.
    """

    def register_source(self, seed: SeedSource) -> dict: ...  # Stage 01
    def ingest(self, source_id: UUID, seed: SeedSource) -> dict: ...  # Stage 02
    def extract(self, source_id: UUID, ingestion_id: UUID, seed: SeedSource) -> dict: ...  # Stage 03
    def qualify(self, source_id: UUID, extraction_id: UUID) -> dict: ...  # Stage 04
    def validate(self, source_id: UUID) -> dict: ...  # Stage 05
    def create_dataset(self, source_id: UUID) -> dict: ...  # Stage 07
    def get_or_create_collection(self, name: str, domain: DomainClassification) -> dict: ...  # Stage 07
    def link_dataset(self, dataset_id: UUID, collection_id: UUID) -> dict: ...  # Stage 07
    def generate_endpoint(self, dataset_id: UUID) -> dict: ...  # Stage 08


class LiveRunUnavailableError(RuntimeError):
    """A live corpus run was requested but this service has no pipeline client for it."""


def get_live_pipeline_client() -> PipelineClient:
    """
    The PipelineClient used by POST /dogfood/run with dry_run=false.

    None exists yet: the service has no Stage 01 registration route or Stage
    02 content-ingestion route (only the Layer 1 pre-check, POST
    /ingest/validate), and Stage 10 is not permitted to fetch third-party
    content to feed extraction. Fails loudly rather than producing a run in
    which every source "fails ingestion" for a reason unrelated to the source.
    """
    raise LiveRunUnavailableError(
        "Live corpus runs need Stage 01 source registration and Stage 02 content "
        "ingestion routes, which this service does not expose yet. Use dry_run=true."
    )


class _StepFailed(Exception):
    def __init__(self, outcome: RunOutcome, stage_reached: str, error: str) -> None:
        super().__init__(error)
        self.outcome = outcome
        self.stage_reached = stage_reached
        self.error = error


def _short(text: str) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= MAX_ERROR_CHARS else text[: MAX_ERROR_CHARS - 1] + "…"


def _step(
    call: Callable[[], Any], model: type[T], outcome: RunOutcome, stage_reached: str
) -> T:
    """Run one pipeline call and P9-validate its response; map any failure to _StepFailed."""
    try:
        raw = call()
    except Exception as exc:  # noqa: BLE001 — any step failure is a recorded outcome
        raise _StepFailed(outcome, stage_reached, _short(f"{type(exc).__name__}: {exc}")) from exc
    try:
        return model.model_validate(raw)
    except ValidationError as exc:
        raise _StepFailed(
            outcome, stage_reached, _short(f"step response failed validation: {exc}")
        ) from exc


def _result(
    seed: SeedSource,
    outcome: RunOutcome,
    stage_reached: str,
    error: Optional[str] = None,
    source_id: Optional[UUID] = None,
) -> SourceRunResult:
    return SourceRunResult(
        source_url=seed.source_url,
        title=seed.title,
        domain=seed.domain,
        outcome=outcome,
        stage_reached=stage_reached,
        licence_status=seed.licence_status,
        error=error,
        source_id=source_id,
    )


def _dry_run_source(seed: SeedSource) -> SourceRunResult:
    if seed.licence_status == LicenceStatus.EXCLUDED:
        return _result(seed, RunOutcome.LICENCE_BLOCKED, "NONE", "licence_status EXCLUDED")
    return _result(seed, RunOutcome.DRY_RUN_PASS, "SEED_VALIDATED")


def _collection_name(corpus: Corpus) -> str:
    return f"PDQE Dogfood — {corpus.value.title()}"


def _live_run_source(
    seed: SeedSource, client: PipelineClient, corpus: Corpus, collections: dict[Corpus, UUID]
) -> SourceRunResult:
    if seed.licence_status == LicenceStatus.EXCLUDED:
        return _result(seed, RunOutcome.LICENCE_BLOCKED, "NONE", "licence_status EXCLUDED")

    source_id: Optional[UUID] = None
    try:
        source_id = _step(
            lambda: client.register_source(seed), RegisteredSource, RunOutcome.FAILED_INGESTION, "NONE"
        ).source_id

        if seed.licence_status in _LICENCE_REVIEW:
            return _result(
                seed,
                RunOutcome.ROUTED_TO_REVIEW,
                "SOURCE_REGISTERED",
                f"licence_status {seed.licence_status.value} requires human licence review",
                source_id,
            )

        sid = source_id
        ingestion_id = _step(
            lambda: client.ingest(sid, seed), IngestionStep, RunOutcome.FAILED_INGESTION, "SOURCE_REGISTERED"
        ).ingestion_id

        extraction = _step(
            lambda: client.extract(sid, ingestion_id, seed),
            ExtractionStep,
            RunOutcome.FAILED_EXTRACTION,
            "INGESTED",
        )
        if not extraction.passed or extraction.extraction_id is None:
            reason = extraction.rejection_reason or extraction.error or extraction.status
            raise _StepFailed(RunOutcome.FAILED_EXTRACTION, "INGESTED", _short(reason))
        extraction_id = extraction.extraction_id

        _step(
            lambda: client.qualify(sid, extraction_id),
            QualificationStep,
            RunOutcome.FAILED_QUALIFICATION,
            "EXTRACTED",
        )

        validation = _step(
            lambda: client.validate(sid), ValidationStep, RunOutcome.FAILED_VALIDATION, "QUALIFIED"
        )
        if validation.outcome == ValidationOutcome.REVIEW:
            return _result(
                seed, RunOutcome.ROUTED_TO_REVIEW, "REVIEW", _short(validation.outcome_reason), source_id
            )
        if validation.outcome == ValidationOutcome.REJECTED:
            raise _StepFailed(RunOutcome.FAILED_VALIDATION, "QUALIFIED", _short(validation.outcome_reason))

        dataset_id = _step(
            lambda: client.create_dataset(sid), DatasetStep, RunOutcome.FAILED_DATASET, "VALIDATED"
        ).dataset_id

        collection_id = collections.get(corpus)
        if collection_id is None:
            collection_id = _step(
                lambda: client.get_or_create_collection(
                    _collection_name(corpus), CORPUS_PRIMARY_DOMAIN[corpus]
                ),
                CollectionStep,
                RunOutcome.FAILED_DATASET,
                "DATASET_CREATED",
            ).collection_id
            collections[corpus] = collection_id
        cid = collection_id

        try:
            client.link_dataset(dataset_id, cid)
        except Exception as exc:  # noqa: BLE001
            raise _StepFailed(
                RunOutcome.FAILED_DATASET, "DATASET_CREATED", _short(f"{type(exc).__name__}: {exc}")
            ) from exc

        _step(
            lambda: client.generate_endpoint(dataset_id),
            EndpointStep,
            RunOutcome.FAILED_ENDPOINT,
            "COLLECTION_LINKED",
        )
    except _StepFailed as failure:
        return _result(seed, failure.outcome, failure.stage_reached, failure.error, source_id)

    # Stage 09 (provider approval, publication) is deliberately not run.
    return _result(seed, RunOutcome.SUCCESS, "ENDPOINT_GENERATED", None, source_id)


def _default_label(corpus: Corpus, dry_run: bool, started_at: datetime) -> str:
    mode = "dry" if dry_run else "live"
    return f"stage10-{corpus.value.lower()}-{mode}-{started_at.strftime('%Y%m%dT%H%M%SZ')}"


def build_report(
    input: DogfoodRunInput,
    corpus: Corpus,
    results: list[SourceRunResult],
    started_at: datetime,
    completed_at: datetime,
) -> DogfoodRunReport:
    """Aggregate per-source results into a DogfoodRunReport."""
    succeeded = sum(1 for r in results if r.outcome in SUCCEEDED_OUTCOMES)
    review = sum(1 for r in results if r.outcome in REVIEW_OUTCOMES)
    failure_modes = [
        {"source_url": r.source_url, "stage": r.stage_reached, "error": r.error or r.outcome.value}
        for r in results
        if r.outcome not in SUCCEEDED_OUTCOMES and r.outcome not in REVIEW_OUTCOMES
    ]
    licence_outcomes = dict(
        Counter((r.licence_status.value if r.licence_status else "UNKNOWN") for r in results)
    )
    return DogfoodRunReport(
        run_label=input.run_label or _default_label(corpus, input.dry_run, started_at),
        domain=input.domain,
        corpus=corpus,
        dry_run=input.dry_run,
        sources_attempted=len(results),
        sources_succeeded=succeeded,
        sources_failed=len(results) - succeeded - review,
        sources_routed_to_review=review,
        results=results,
        failure_modes=failure_modes,
        licence_outcomes=licence_outcomes,
        started_at=started_at,
        completed_at=completed_at,
    )


def run_corpus(
    input: DogfoodRunInput,
    write_to_db: bool = False,
    client: Optional[PipelineClient] = None,
) -> DogfoodRunReport:
    """
    Run one corpus and return its report.

    1. Load and validate the seed sources for input.domain
    2. For each source (up to max_sources): dry run → seed + licence check
       only; live run → Stages 01–08 via `client`
    3. Build the DogfoodRunReport
    4. If write_to_db: insert it into pdqe.dogfood_runs (sets report.run_id)

    Raises ValueError for an unknown domain or an invalid corpus file, and
    for a live run without a client.
    """
    corpus = resolve_corpus(input.domain)
    if not input.dry_run and client is None:
        raise ValueError("a live corpus run requires a PipelineClient")

    started_at = datetime.now(timezone.utc)
    seeds = load_corpus(input.domain)
    if input.max_sources is not None:
        seeds = seeds[: input.max_sources]

    collections: dict[Corpus, UUID] = {}
    results: list[SourceRunResult] = []
    for seed in seeds:
        if input.dry_run:
            results.append(_dry_run_source(seed))
        else:
            assert client is not None
            results.append(_live_run_source(seed, client, corpus, collections))
        logger.info("dogfood %s: %s → %s", corpus.value, seed.source_url, results[-1].outcome.value)

    report = build_report(input, corpus, results, started_at, datetime.now(timezone.utc))
    if write_to_db:
        run_id = db.write_run_report(report, input.dry_run)
        report = report.model_copy(update={"run_id": UUID(run_id)})
    return report
