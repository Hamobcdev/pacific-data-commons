"""
PDQE Pipeline — FastAPI application.

Stage history:
  0.2.0 — Stage 02: secure ingestion, Layer 1 pre-check endpoint
  0.3.0 — Stage 03: Claude extraction endpoint added
  0.4.0 — Stage 04: Jev qualification endpoint added
  0.5.0 — Stage 05: deterministic validation endpoint added
  0.6.0 — Stage 06: human review queue endpoints added

Routes:
  GET  /health              — health check (reports current stage)
  POST /ingest/validate     — Layer 1 pre-check (Stage 02)
  POST /extract             — Stage 03 extraction (Layer 3 → Claude → Layer 4 → Supabase)
  POST /qualify/{source_id} — Stage 04 qualification (Jev → thresholds → Supabase)
  POST /validate/{source_id} — Stage 05 deterministic validation (validators → routing → Supabase)
  POST /review/enqueue/{source_id} — Stage 06 queue a REVIEW-state source for human review
  POST /review/decide       — Stage 06 record an APPROVED/REJECTED decision (mandatory reason)
  GET  /review/pending      — Stage 06 pending reviews for the reviewer dashboard

The /review/* routes require the X-PDQE-Review-Key header (see
_require_review_key) — they expose reviewer evidence and record decisions
that advance a source toward publication.
"""

from __future__ import annotations

import hmac
import os
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel

from app.extraction.extractor import ExtractionRunResult, run_extraction
from app.qualification.qualifier import qualify
from app.qualification.schemas import JevAssessmentOutput
from app.review.queue import (
    MAX_PENDING_PAGE,
    enqueue_review,
    list_pending_reviews,
    record_decision,
)
from app.review.schemas import (
    EnqueueReviewInput,
    ReviewDecisionInput,
    ReviewQueueItem,
    ReviewRecord,
)
from app.security.layer1_whitelist import Layer1Result, check_layer1
from app.validation.orchestrator import run_validation
from app.validation.schemas import ValidationOutput

app = FastAPI(title="PDQE Pipeline", version="0.6.0")


# ── Health ──────────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "stage": "06-human-review", "version": "0.6.0"}


# ── Stage 02 — Layer 1 pre-check ────────────────────────────────────────────────

class IngestValidateRequest(BaseModel):
    file_name: str
    file_extension: str


@app.post("/ingest/validate", response_model=Layer1Result)
def ingest_validate(payload: IngestValidateRequest) -> Layer1Result:
    """
    Layer 1 only. Does not write to Supabase — persistence happens via the
    pdqe.ingestion_events INSERT path (migration 20261008000005), which
    runs this same whitelist check SQL-side as the authoritative gate.
    This endpoint lets a caller pre-check a file before upload.
    """
    return check_layer1(payload.file_name, payload.file_extension)


# ── Stage 03 — Claude Extraction ────────────────────────────────────────────────

class ExtractRequest(BaseModel):
    """
    Request body for POST /extract.

    Fields
    ------
    ingestion_id:
        UUID of the pdqe.ingestion_events row being processed.
        Must have status 'APPROVED' or 'LAYER3_PROMPT_READY'.
    source_id:
        UUID of the parent pdqe.sources row.
    source_title:
        Registered source title. Used as a reference hint in the prompt only.
    sanitised_content:
        Layer 2 sanitised text. Must be non-empty.
    contributing_ingestion_ids:
        Optional. For multi-document synthesis: UUIDs of ALL ingestion events
        contributing content. Defaults to [ingestion_id] for single-doc.
    multi_doc_titles:
        Optional. For multi-document synthesis: titles of additional source
        documents being synthesised (beyond source_title).
    """

    ingestion_id: str
    source_id: str
    source_title: str
    sanitised_content: str
    contributing_ingestion_ids: list[str] | None = None
    multi_doc_titles: list[str] | None = None


class ExtractResponse(BaseModel):
    """
    Response body for POST /extract.

    Fields
    ------
    extraction_id:
        UUID of the pdqe.extractions row written. None if the Supabase write
        itself failed (the Claude call may still have succeeded — check logs).
    passed:
        True if Layer 4 schema validation passed. False means the extraction
        was stored with status='REJECTED' for human review (Stage 06).
    status:
        'VALIDATED' | 'REJECTED' | 'API_ERROR' | 'PARSE_ERROR'
    rejection_reason:
        Populated when passed=False. Human-readable description of the failure.
    model_id:
        Claude model identifier returned by the API. None on API error.
    input_tokens:
        Prompt token count. None on API error.
    output_tokens:
        Completion token count. None on API error.
    error:
        Populated on API call error or JSON parse error. Distinct from
        rejection_reason (which is a schema validation failure).
    """

    extraction_id: str | None
    passed: bool
    status: str
    rejection_reason: str | None
    model_id: str | None
    input_tokens: int | None
    output_tokens: int | None
    error: str | None


def _build_status(result: ExtractionRunResult) -> str:
    if result.error == "empty_content":
        return "REJECTED"
    if result.error and result.model_id is None:
        # API call failed before we got a response
        return "API_ERROR"
    if result.error:
        # Got a response but couldn't parse JSON
        return "PARSE_ERROR"
    return "VALIDATED" if result.validation_result.passed else "REJECTED"


@app.post("/extract", response_model=ExtractResponse)
def extract(payload: ExtractRequest) -> ExtractResponse:
    """
    Run Stage 03 extraction for one ingestion event.

    P9: sanitised_content is treated as untrusted data inside the Claude
    prompt. The response is validated against a strict JSON schema (Layer 4)
    before any field is used or stored.

    Returns HTTP 200 for both VALIDATED and REJECTED outcomes — both are
    valid pipeline states written to pdqe.extractions. Returns HTTP 422 for
    malformed request bodies (Pydantic) and HTTP 500 for unexpected errors
    that prevent the pipeline from running at all.
    """
    try:
        result: ExtractionRunResult = run_extraction(
            ingestion_id=payload.ingestion_id,
            source_id=payload.source_id,
            source_title=payload.source_title,
            sanitised_content=payload.sanitised_content,
            contributing_ingestion_ids=payload.contributing_ingestion_ids,
            multi_doc_titles=payload.multi_doc_titles,
        )
    except Exception as exc:  # noqa: BLE001
        # Unexpected error — not a validation failure
        raise HTTPException(
            status_code=500,
            detail=f"Extraction pipeline encountered an unexpected error: {exc}",
        ) from exc

    return ExtractResponse(
        extraction_id=result.extraction_id,
        passed=result.validation_result.passed,
        status=_build_status(result),
        rejection_reason=result.validation_result.rejection_reason,
        model_id=result.model_id,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        error=result.error,
    )


# ── Stage 04 — Jev Qualification ────────────────────────────────────────────────

class QualifyRequest(BaseModel):
    """Request body for POST /qualify/{source_id}."""

    extraction_id: str


@app.post("/qualify/{source_id}", response_model=JevAssessmentOutput)
async def qualify_endpoint(source_id: str, payload: QualifyRequest) -> JevAssessmentOutput:
    """
    Run Stage 04 Jev qualification for a validated extraction.

    source_id is a path parameter for routing/logging symmetry with the rest
    of the pipeline API; the extraction to qualify is identified by
    extraction_id in the request body, since pdqe.extractions is keyed on
    extraction_id and a source may have more than one extraction over its
    lifetime (re-extraction).

    Raises HTTP 400 if the extraction is not found or not in VALIDATED state.
    Raises HTTP 500 on an unexpected Jev, validation, or DB error.
    """
    try:
        extraction_id = UUID(payload.extraction_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"extraction_id is not a valid UUID: {exc}") from exc

    try:
        return await qualify(extraction_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Qualification pipeline encountered an unexpected error: {exc}",
        ) from exc


# ── Stage 05 — Deterministic Validation ─────────────────────────────────────────

@app.post("/validate/{source_id}", response_model=ValidationOutput)
def validate_endpoint(source_id: str) -> ValidationOutput:
    """
    Run Stage 05 deterministic validation for a QUALIFIED source.

    Applies the deterministic validators to the source's latest Jev
    assessment + extraction and advances the lifecycle
    QUALIFIED → VALIDATED | REVIEW | REJECTED. No model is called.

    Sync handler on purpose: the Supabase client is blocking, so FastAPI runs
    it in its threadpool instead of on the event loop.

    Raises HTTP 400 if source_id is not a UUID, or the source/assessment/
    extraction is missing, mismatched, or the source is not QUALIFIED.
    Raises HTTP 500 on an unexpected validation or DB error.
    """
    try:
        sid = UUID(source_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"source_id is not a valid UUID: {exc}") from exc

    try:
        return run_validation(sid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Validation pipeline encountered an unexpected error: {exc}",
        ) from exc


# ── Stage 06 — Human Review ─────────────────────────────────────────────────────

def _require_review_key(x_pdqe_review_key: str | None = Header(default=None)) -> None:
    """
    Shared-secret guard for the /review/* routes. Fails closed: if
    PDQE_REVIEW_API_KEY is not configured the routes return 503 rather than
    running unauthenticated. Constant-time comparison.
    """
    expected = os.environ.get("PDQE_REVIEW_API_KEY")
    if not expected:
        raise HTTPException(status_code=503, detail="Review API is not configured")
    if not x_pdqe_review_key or not hmac.compare_digest(
        x_pdqe_review_key.encode(), expected.encode()
    ):
        raise HTTPException(status_code=401, detail="Invalid or missing review API key")


@app.post(
    "/review/enqueue/{source_id}",
    response_model=ReviewQueueItem,
    dependencies=[Depends(_require_review_key)],
)
def enqueue_review_endpoint(source_id: str, payload: EnqueueReviewInput) -> ReviewQueueItem:
    """
    Stage 06: enqueue a REVIEW-state source for human review.

    Body: {"validation_id": "<uuid>"} — the Stage 05 validation whose outcome
    was REVIEW. Raises HTTP 400 if the source is not in REVIEW, the
    validation doesn't belong to it or wasn't a REVIEW outcome, or the review
    is already queued.
    """
    try:
        sid = UUID(source_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"source_id is not a valid UUID: {exc}") from exc

    try:
        return enqueue_review(sid, payload.validation_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Review queue encountered an unexpected error: {exc}",
        ) from exc


@app.post(
    "/review/decide",
    response_model=ReviewRecord,
    dependencies=[Depends(_require_review_key)],
)
def record_decision_endpoint(payload: ReviewDecisionInput) -> ReviewRecord:
    """
    Stage 06: record a human reviewer decision.

    Body: {"review_id": "<uuid>", "decision": "APPROVED|REJECTED",
           "decision_reason": "<text>", "reviewer_id": "<auth.users uuid>"}

    Advances REVIEW → APPROVED | REJECTED. Raises HTTP 400 if the review is
    missing or already decided, or the transition is refused (e.g. approving
    while licence_status is UNKNOWN). Malformed bodies are rejected with 422.
    """
    try:
        return record_decision(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Review decision encountered an unexpected error: {exc}",
        ) from exc


@app.get(
    "/review/pending",
    response_model=list[ReviewRecord],
    dependencies=[Depends(_require_review_key)],
)
def list_pending_endpoint(
    limit: int = Query(default=MAX_PENDING_PAGE, ge=1, le=MAX_PENDING_PAGE),
) -> list[ReviewRecord]:
    """Stage 06: list pending human reviews, newest first."""
    try:
        return list_pending_reviews(limit)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
