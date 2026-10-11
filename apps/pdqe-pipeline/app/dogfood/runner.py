"""
PDQE Stage 10 / 10.1 — corpus runner.

Drives each seed source of one corpus through the pipeline and records the
outcome: success, failure mode and stage, licence result, review routing.

dry_run=True (default): validates the seed sources and their licence gate
  only. Fetches nothing, writes no pipeline rows, needs no pipeline client.
dry_run=False: fetches each source's content at runtime (fetcher.py) and runs
  Stage 01 registration through Stage 08 endpoint generation via a
  PipelineClient — in production the in-process DirectPipelineClient
  (pipeline_client.py), which calls the pipeline functions directly. It never
  runs Stage 09 — provider approval and publication remain manual gates, so a
  successful source stops at ENDPOINT_GENERATED (endpoint DRAFT).

Licence gate (applied before any fetch or pipeline call, "unknown is not approval"):
  EXCLUDED         → LICENCE_BLOCKED, never fetched or registered
  UNKNOWN          → registered, then ROUTED_TO_REVIEW (licence review)
  REVIEW_REQUIRED  → as UNKNOWN, unless DOGFOOD_AUTO_APPROVE is on
  CLEAR, RESTRICTED → full pipeline; Stage 05 validators decide the rest

Approval gate after Stage 05:
  REVIEW outcome   → ROUTED_TO_REVIEW (auto-approve never overrides validators)
  VALIDATED        → ROUTED_TO_REVIEW, unless DOGFOOD_AUTO_APPROVE is on, in
                     which case VALIDATED → APPROVED is applied, a WARNING with
                     the required follow-up is logged, and the source is listed
                     in report.auto_approved_sources (GET /dogfood/review-queue).

Re-runs are idempotent (pipeline_client.py): a source an earlier run already
took to EXTRACTED or later is ALREADY_PROCESSED, one that was REJECTED or
QUARANTINED is SKIPPED_PREVIOUSLY_REJECTED. Both are counted separately in the
report — neither successes nor failures. An INGESTED source resumes from
extraction and a partial one is claimed; either way Layer 2 re-runs (P9). If
the URL's content no longer matches its recorded hash the outcome is
CONTENT_CHANGED, counted with routed-to-review (a declared update is needed).

DOGFOOD_AUTO_APPROVE is a development tool only. It takes effect only when
PDQE_ENVIRONMENT is "development" or "staging"; set anywhere else (including
unset) a live run is refused rather than silently ignoring it.
"""

from __future__ import annotations

import logging
import os
import tempfile
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Callable, Optional, Protocol, TypeVar
from uuid import UUID

from pydantic import BaseModel, ValidationError

from app.dogfood import supabase_client as db
from app.dogfood.fetcher import FetchError, FetchResult, fetch_source
from app.dogfood.loader import load_corpus
from app.dogfood.schemas import (
    CORPUS_PRIMARY_DOMAIN,
    REVIEW_OUTCOMES,
    SKIPPED_OUTCOMES,
    SUCCEEDED_OUTCOMES,
    AutoApprovedSource,
    ReviewQueueEntry,
    CollectionStep,
    Corpus,
    DatasetStep,
    DogfoodRunInput,
    DogfoodRunReport,
    EndpointStep,
    ExistingSource,
    ExtractionStep,
    IngestionStep,
    MAX_ERROR_CHARS,
    QualificationStep,
    RegisteredSource,
    ResumeAction,
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

T = TypeVar("T", bound=BaseModel)

AUTO_APPROVE_ENV = "DOGFOOD_AUTO_APPROVE"  # Render: DOGFOOD_AUTO_APPROVE=false (never true in production)
ENVIRONMENT_ENV = "PDQE_ENVIRONMENT"
AUTO_APPROVE_ENVIRONMENTS = frozenset({"development", "staging"})

Fetcher = Callable[[SeedSource, str], FetchResult]


class PipelineClient(Protocol):
    """
    One method per pipeline call the runner makes, in order. Each returns the
    step's JSON response as a dict (validated by the runner, P9) and raises
    on a refused or failed step.
    """

    def find_existing_source(self, seed: SeedSource) -> dict: ...  # idempotent resume (URL check)
    def register_source(self, seed: SeedSource, fetch: Optional[FetchResult] = None) -> dict: ...  # Stage 01
    def ingest(self, source_id: UUID, seed: SeedSource, fetch: FetchResult) -> dict: ...  # Stage 02
    def resume_ingested(self, source_id: UUID, seed: SeedSource, fetch: FetchResult) -> dict: ...  # Stage 02 (resume)
    def claim_partial(self, source_id: UUID, seed: SeedSource, fetch: FetchResult) -> dict: ...  # Stage 02 (claim)
    def extract(self, source_id: UUID, ingestion_id: UUID, seed: SeedSource) -> dict: ...  # Stage 03
    def qualify(self, source_id: UUID, extraction_id: UUID) -> dict: ...  # Stage 04
    def validate(self, source_id: UUID) -> dict: ...  # Stage 05
    def dogfood_auto_approve(self, source_id: UUID, rationale: str) -> None: ...  # VALIDATED → APPROVED
    def create_dataset(self, source_id: UUID) -> dict: ...  # Stage 07
    def get_or_create_collection(self, name: str, domain: DomainClassification) -> dict: ...  # Stage 07
    def link_dataset(self, dataset_id: UUID, collection_id: UUID) -> dict: ...  # Stage 07
    def generate_endpoint(self, dataset_id: UUID, collection_id: Optional[UUID] = None) -> dict: ...  # Stage 08


class LiveRunUnavailableError(RuntimeError):
    """A live corpus run was requested but this service is not configured for one."""


def get_live_pipeline_client() -> PipelineClient:
    """
    The PipelineClient used by POST /dogfood/run with dry_run=false: the
    in-process DirectPipelineClient. Raises LiveRunUnavailableError (→ HTTP
    501) when PDQE_DOGFOOD_OPERATOR_ID, the auth.users id recorded as
    registered_by, is not configured.
    """
    from app.dogfood.pipeline_client import DirectPipelineClient, get_operator_id

    try:
        operator_id = get_operator_id()
    except RuntimeError as exc:
        raise LiveRunUnavailableError(f"Live corpus runs are not configured: {exc}") from exc
    return DirectPipelineClient(operator_id)


# ── DOGFOOD_AUTO_APPROVE ──────────────────────────────────────────────────────

def _auto_approve_requested() -> bool:
    return os.getenv(AUTO_APPROVE_ENV, "false").strip().lower() == "true"


def _auto_approve_environment_ok() -> bool:
    return os.getenv(ENVIRONMENT_ENV, "").strip().lower() in AUTO_APPROVE_ENVIRONMENTS


def auto_approve_enabled() -> bool:
    """
    True only when DOGFOOD_AUTO_APPROVE=true on a development/staging service.
    Raises ValueError when it is requested anywhere else, so a misconfigured
    production service refuses the run instead of silently bypassing review.
    """
    if not _auto_approve_requested():
        return False
    if not _auto_approve_environment_ok():
        raise ValueError(
            f"{AUTO_APPROVE_ENV}=true is refused: {ENVIRONMENT_ENV} must be one of "
            f"{sorted(AUTO_APPROVE_ENVIRONMENTS)}. Human review is required in production."
        )
    return True


def _auto_approve_source(
    source_id: UUID, seed: SeedSource, run_label: str, client: PipelineClient
) -> AutoApprovedSource:
    """
    Bypass human review for dogfood runs only.
    NEVER called unless DOGFOOD_AUTO_APPROVE=true AND dry_run=False (the
    runner only reaches it from a live run). Raises RuntimeError if called
    outside of that context.

    Always logs a structured WARNING so the operator knows exactly which
    sources bypassed human review and what follow-up is required.
    """
    if not _auto_approve_requested() or not _auto_approve_environment_ok():
        raise RuntimeError(
            "auto_approve called without DOGFOOD_AUTO_APPROVE=true on a development/staging "
            "service — this is a bug; human review is required in production"
        )
    client.dogfood_auto_approve(
        source_id,
        f"DOGFOOD_AUTO_APPROVE ({run_label}): human review bypassed for internal dogfooding; "
        "manual licence review required before publication",
    )
    logger.warning(
        "DOGFOOD_AUTO_APPROVE: bypassed human review gate",
        extra={
            "source_id": str(source_id),
            "source_url": seed.source_url,
            "title": seed.title,
            "domain": seed.domain.value,
            "licence_status": seed.licence_status.value,
            "run_label": run_label,
            "action_required": (
                "This source bypassed human licence review. "
                "Before this endpoint can be published, a human must verify: "
                "1) reuse rights are confirmed; "
                "2) licence_status is updated from UNKNOWN/REVIEW_REQUIRED to CLEAR or RESTRICTED; "
                "3) source record is manually approved via the review queue."
            ),
        },
    )
    return AutoApprovedSource(
        source_id=source_id,
        source_url=seed.source_url,
        title=seed.title,
        domain=seed.domain,
        licence_status=seed.licence_status,
    )


# ── Steps ─────────────────────────────────────────────────────────────────────

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


_SKIP_OUTCOME = {
    ResumeAction.ALREADY_PROCESSED: RunOutcome.ALREADY_PROCESSED,
    ResumeAction.SKIPPED_PREVIOUSLY_REJECTED: RunOutcome.SKIPPED_PREVIOUSLY_REJECTED,
}


def _skipped_result(
    seed: SeedSource, action: ResumeAction, source_id: Optional[UUID],
    lifecycle_state: Optional[str], reason: Optional[str],
) -> SourceRunResult:
    """A source an earlier run already handled (idempotent resume)."""
    if action == ResumeAction.ALREADY_PROCESSED:
        detail = reason or f"already processed in an earlier run (lifecycle_state {lifecycle_state})"
    else:
        detail = f"previously rejected: {reason or lifecycle_state}"
    return _result(seed, _SKIP_OUTCOME[action], lifecycle_state or "NONE", _short(detail), source_id)


def _dry_run_source(seed: SeedSource) -> SourceRunResult:
    if seed.licence_status == LicenceStatus.EXCLUDED:
        return _result(seed, RunOutcome.LICENCE_BLOCKED, "NONE", "licence_status EXCLUDED")
    return _result(seed, RunOutcome.DRY_RUN_PASS, "SEED_VALIDATED")


def _collection_name(corpus: Corpus) -> str:
    return f"PDQE Dogfood — {corpus.value.title()}"


def _remove_temp(path: Optional[str]) -> None:
    if not path:
        return
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass
    except OSError as exc:  # noqa: BLE001 — cleanup failure is logged, not raised
        logger.warning("dogfood: could not delete temp file %s: %s", path, exc)


class _LiveContext:
    """Per-run state shared by every source in a live run."""

    def __init__(
        self, client: PipelineClient, corpus: Corpus, run_label: str, auto_approve: bool,
        fetcher: Fetcher, tmp_dir: str,
    ) -> None:
        self.client = client
        self.corpus = corpus
        self.run_label = run_label
        self.auto_approve = auto_approve
        self.fetcher = fetcher
        self.tmp_dir = tmp_dir
        self.collection_id: Optional[UUID] = None
        self.auto_approved: list[AutoApprovedSource] = []


def _live_run_source(seed: SeedSource, ctx: _LiveContext) -> SourceRunResult:
    if seed.licence_status == LicenceStatus.EXCLUDED:
        return _result(seed, RunOutcome.LICENCE_BLOCKED, "NONE", "licence_status EXCLUDED")

    client = ctx.client
    licence_review = seed.licence_status == LicenceStatus.UNKNOWN or (
        seed.licence_status == LicenceStatus.REVIEW_REQUIRED and not ctx.auto_approve
    )
    source_id: Optional[UUID] = None
    fetched: Optional[FetchResult] = None
    try:
        if licence_review:
            # Registered for the licence review queue; content is never fetched.
            source_id = _step(
                lambda: client.register_source(seed), RegisteredSource, RunOutcome.FAILED_INGESTION, "NONE"
            ).source_id
            return _result(
                seed,
                RunOutcome.ROUTED_TO_REVIEW,
                "SOURCE_REGISTERED",
                f"licence_status {seed.licence_status.value} requires human licence review",
                source_id,
            )

        # Idempotent resume, URL check: an earlier run may already have handled this source.
        existing = _step(
            lambda: client.find_existing_source(seed), ExistingSource, RunOutcome.FAILED_INGESTION, "NONE"
        )
        if existing.action in _SKIP_OUTCOME:
            return _skipped_result(
                seed, existing.action, existing.source_id, existing.lifecycle_state, existing.reason
            )

        if existing.action == ResumeAction.RESUME_ENDPOINT:
            # Dataset + collection already exist (lifecycle_state DATASET_CREATED or
            # COLLECTION_LINKED). Skip all earlier stages and run Stage 08 only.
            # Content is NOT re-fetched (no new Layer 2 pass required).
            source_id = existing.source_id
            eid = existing.dataset_id
            cid = existing.collection_id
            _step(
                lambda: client.generate_endpoint(eid, cid),
                EndpointStep,
                RunOutcome.FAILED_ENDPOINT,
                existing.lifecycle_state or "COLLECTION_LINKED",
            )
            return _result(seed, RunOutcome.SUCCESS, "ENDPOINT_GENERATED", None, source_id)

        try:
            fetched = ctx.fetcher(seed, ctx.tmp_dir)
        except FetchError as exc:
            raise _StepFailed(RunOutcome.FAILED_INGESTION, "NONE", _short(f"FetchError: {exc}")) from exc
        fetch = fetched

        if existing.action == ResumeAction.RESUME_EXTRACTION:
            # INGESTED earlier: no new registration, but Layer 1 + Layer 2 still re-run.
            source_id = existing.source_id
            sid = source_id
            ingestion = _step(
                lambda: client.resume_ingested(sid, seed, fetch), IngestionStep, RunOutcome.FAILED_INGESTION, "INGESTED"
            )
        elif existing.action == ResumeAction.CLAIM_PARTIAL:
            # Partial earlier ingestion of this URL: claim its row (P9 — Layer 2 re-runs on it).
            source_id = existing.source_id
            sid = source_id
            ingestion = _step(
                lambda: client.claim_partial(sid, seed, fetch),
                IngestionStep,
                RunOutcome.FAILED_INGESTION,
                existing.lifecycle_state or "SOURCE_REGISTERED",
            )
        else:
            source_id = _step(
                lambda: client.register_source(seed, fetch), RegisteredSource, RunOutcome.FAILED_INGESTION, "NONE"
            ).source_id
            sid = source_id
            ingestion = _step(
                lambda: client.ingest(sid, seed, fetch), IngestionStep, RunOutcome.FAILED_INGESTION, "SOURCE_REGISTERED"
            )
        # The ingestion step may continue on (or stop at) a different, existing source.
        if ingestion.resume != ResumeAction.NEW:
            source_id = ingestion.source_id
            sid = source_id
            if ingestion.resume in _SKIP_OUTCOME:
                return _skipped_result(
                    seed, ingestion.resume, source_id, ingestion.lifecycle_state, ingestion.reason
                )
            if ingestion.resume == ResumeAction.CONTENT_CHANGED:
                return _result(
                    seed,
                    RunOutcome.CONTENT_CHANGED,
                    ingestion.lifecycle_state or "NONE",
                    _short(ingestion.reason or "upstream content changed; declared dataset update required"),
                    source_id,
                )
        ingestion_id = ingestion.ingestion_id

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

        if not ctx.auto_approve:
            return _result(
                seed,
                RunOutcome.ROUTED_TO_REVIEW,
                "VALIDATED",
                "validated; awaiting human approval (DOGFOOD_AUTO_APPROVE is off)",
                source_id,
            )
        try:
            approved = _auto_approve_source(sid, seed, ctx.run_label, client)
        except Exception as exc:  # noqa: BLE001
            raise _StepFailed(
                RunOutcome.FAILED_VALIDATION, "VALIDATED", _short(f"auto-approve refused: {type(exc).__name__}: {exc}")
            ) from exc
        ctx.auto_approved.append(approved)

        dataset_id = _step(
            lambda: client.create_dataset(sid), DatasetStep, RunOutcome.FAILED_DATASET, "APPROVED"
        ).dataset_id

        if ctx.collection_id is None:
            ctx.collection_id = _step(
                lambda: client.get_or_create_collection(
                    _collection_name(ctx.corpus), CORPUS_PRIMARY_DOMAIN[ctx.corpus]
                ),
                CollectionStep,
                RunOutcome.FAILED_DATASET,
                "DATASET_CREATED",
            ).collection_id
        cid = ctx.collection_id

        try:
            client.link_dataset(dataset_id, cid)
        except Exception as exc:  # noqa: BLE001
            raise _StepFailed(
                RunOutcome.FAILED_DATASET, "DATASET_CREATED", _short(f"{type(exc).__name__}: {exc}")
            ) from exc

        _step(
            lambda: client.generate_endpoint(dataset_id, cid),
            EndpointStep,
            RunOutcome.FAILED_ENDPOINT,
            "COLLECTION_LINKED",
        )
    except _StepFailed as failure:
        return _result(seed, failure.outcome, failure.stage_reached, failure.error, source_id)
    finally:
        _remove_temp(fetched.local_path if fetched else None)

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
    run_label: Optional[str] = None,
    auto_approved_sources: Optional[list[AutoApprovedSource]] = None,
) -> DogfoodRunReport:
    """Aggregate per-source results into a DogfoodRunReport."""
    succeeded = sum(1 for r in results if r.outcome in SUCCEEDED_OUTCOMES)
    review = sum(1 for r in results if r.outcome in REVIEW_OUTCOMES)
    # Sources an earlier run already handled: neither successes nor failures.
    already_processed = sum(1 for r in results if r.outcome == RunOutcome.ALREADY_PROCESSED)
    skipped_rejected = sum(1 for r in results if r.outcome == RunOutcome.SKIPPED_PREVIOUSLY_REJECTED)
    not_failed = SUCCEEDED_OUTCOMES | REVIEW_OUTCOMES | SKIPPED_OUTCOMES
    failure_modes = [
        {"source_url": r.source_url, "stage": r.stage_reached, "error": r.error or r.outcome.value}
        for r in results
        if r.outcome not in not_failed
    ]
    licence_outcomes = dict(
        Counter((r.licence_status.value if r.licence_status else "UNKNOWN") for r in results)
    )
    return DogfoodRunReport(
        run_label=run_label or input.run_label or _default_label(corpus, input.dry_run, started_at),
        domain=input.domain,
        corpus=corpus,
        dry_run=input.dry_run,
        sources_attempted=len(results),
        sources_succeeded=succeeded,
        sources_failed=len(results) - succeeded - review - already_processed - skipped_rejected,
        sources_routed_to_review=review,
        sources_already_processed=already_processed,
        sources_skipped_previously_rejected=skipped_rejected,
        results=results,
        failure_modes=failure_modes,
        licence_outcomes=licence_outcomes,
        started_at=started_at,
        completed_at=completed_at,
        auto_approved_sources=list(auto_approved_sources or []),
    )


def run_corpus(
    input: DogfoodRunInput,
    write_to_db: bool = False,
    client: Optional[PipelineClient] = None,
    fetcher: Optional[Fetcher] = None,
) -> DogfoodRunReport:
    """
    Run one corpus and return its report.

    1. Load and validate the seed sources for input.domain
    2. For each source (up to max_sources): dry run → seed + licence check
       only; live run → fetch content, then Stages 01–08 via `client`
       (temp files are always deleted, success or failure)
    3. Build the DogfoodRunReport (incl. auto_approved_sources)
    4. If write_to_db: insert it into pdqe.dogfood_runs (sets report.run_id)

    Raises ValueError for an unknown domain, an invalid corpus file, a live
    run without a client, or DOGFOOD_AUTO_APPROVE set outside development.
    """
    corpus = resolve_corpus(input.domain)
    if not input.dry_run and client is None:
        raise ValueError("a live corpus run requires a PipelineClient")
    auto_approve = False if input.dry_run else auto_approve_enabled()

    started_at = datetime.now(timezone.utc)
    run_label = input.run_label or _default_label(corpus, input.dry_run, started_at)
    seeds = load_corpus(input.domain)
    if input.max_sources is not None:
        seeds = seeds[: input.max_sources]

    results: list[SourceRunResult] = []
    auto_approved: list[AutoApprovedSource] = []
    if input.dry_run:
        for seed in seeds:
            results.append(_dry_run_source(seed))
            logger.info("dogfood %s: %s → %s", corpus.value, seed.source_url, results[-1].outcome.value)
    else:
        assert client is not None
        with tempfile.TemporaryDirectory(prefix="pdqe-dogfood-") as tmp_dir:
            ctx = _LiveContext(client, corpus, run_label, auto_approve, fetcher or fetch_source, tmp_dir)
            for seed in seeds:
                results.append(_live_run_source(seed, ctx))
                logger.info("dogfood %s: %s → %s", corpus.value, seed.source_url, results[-1].outcome.value)
            auto_approved = ctx.auto_approved

    report = build_report(
        input, corpus, results, started_at, datetime.now(timezone.utc), run_label, auto_approved
    )
    if write_to_db:
        run_id = db.write_run_report(report, input.dry_run)
        report = report.model_copy(update={"run_id": UUID(run_id)})
    return report


# ── GET /dogfood/review-queue ─────────────────────────────────────────────────

def list_review_queue() -> list[ReviewQueueEntry]:
    """
    Every auto-approved source across recorded live runs whose licence has not
    yet been confirmed by a human (pdqe.sources.licence_confirmed_by is NULL,
    or the source row no longer exists), newest run first. A source
    auto-approved in several runs is listed once, under its latest run.

    P9: run_report JSONB is re-validated through AutoApprovedSource; a
    malformed entry is a data error (ValueError), not silently skipped.
    """
    pending: list[ReviewQueueEntry] = []
    seen: set[UUID] = set()
    for row in db.list_live_run_reports():
        report = row.get("run_report") or {}
        for raw in report.get("auto_approved_sources") or []:
            try:
                source = AutoApprovedSource.model_validate(raw)
            except ValidationError as exc:
                raise ValueError(f"run {row.get('run_id')} has a malformed auto_approved_sources entry: {exc}") from exc
            if source.source_id in seen:
                continue
            seen.add(source.source_id)
            pending.append(
                ReviewQueueEntry(
                    run_id=row["run_id"],
                    run_label=row["run_label"],
                    run_started_at=row["started_at"],
                    **source.model_dump(),
                )
            )
    confirmed = db.fetch_licence_confirmations([str(e.source_id) for e in pending])
    pending = [e for e in pending if confirmed.get(str(e.source_id)) is None]
    pending.sort(key=lambda e: e.run_started_at, reverse=True)
    return pending
