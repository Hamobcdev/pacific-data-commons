"""
PDQE Pipeline — FastAPI application.

Stage history:
  0.2.0 — Stage 02: secure ingestion, Layer 1 pre-check endpoint
  0.3.0 — Stage 03: Claude extraction endpoint added
  0.4.0 — Stage 04: Jev qualification endpoint added
  0.5.0 — Stage 05: deterministic validation endpoint added
  0.6.0 — Stage 06: human review queue endpoints added
  0.7.0 — Stage 07: dataset and collection model endpoints added
  0.8.0 — Stage 08: endpoint generation endpoints added
  0.9.0 — Stage 09: PDC integration endpoints added
  0.10.0 — Stage 10: internal dogfooding corpus runner endpoints added
  0.10.1 — Stage 10.1: live corpus runner (fetcher, direct pipeline calls,
           DOGFOOD_AUTO_APPROVE guard), /dogfood/review-queue added
  0.10.2 — Stage 02b: Layer 2 content sanitisation implemented (no new routes)

Routes:
  GET  /health              — health check (reports current stage)
  POST /ingest/validate     — Layer 1 pre-check (Stage 02)
  POST /extract             — Stage 03 extraction (Layer 3 → Claude → Layer 4 → Supabase)
  POST /qualify/{source_id} — Stage 04 qualification (Jev → thresholds → Supabase)
  POST /validate/{source_id} — Stage 05 deterministic validation (validators → routing → Supabase)
  POST /review/enqueue/{source_id} — Stage 06 queue a REVIEW-state source for human review
  POST /review/decide       — Stage 06 record an APPROVED/REJECTED decision (mandatory reason)
  GET  /review/pending      — Stage 06 pending reviews for the reviewer dashboard
  POST /dataset/create/{source_id}                — Stage 07 dataset from an APPROVED source
  POST /collection/create                         — Stage 07 create a thematic collection
  POST /dataset/{dataset_id}/link/{collection_id} — Stage 07 link dataset to collection
  GET  /dataset/{dataset_id}                      — Stage 07 dataset record
  GET  /collection/{collection_id}/datasets       — Stage 07 datasets in a collection
  POST /endpoint/generate/{dataset_id}            — Stage 08 generate a DRAFT endpoint spec
  GET  /endpoint/{endpoint_id}                    — Stage 08 endpoint record
  GET  /endpoints                                 — Stage 08 list endpoints (optional ?status=)
  POST /integration/validate/{endpoint_id}        — Stage 09 automated endpoint validation
  POST /integration/approve/{endpoint_id}         — Stage 09 provider wallet + price approval
  POST /integration/publish/{endpoint_id}         — Stage 09 SBP admin publication
  POST /integration/register/{endpoint_id}        — Stage 09 x402 registration via pdc-x402-adapter
  POST /integration/pipeline/{endpoint_id}        — Stage 09 full pipeline (testing; off by default)
  POST /dogfood/run                               — Stage 10 corpus run (dry_run=true by default)
  GET  /dogfood/report                            — Stage 10 recent corpus run summaries
  GET  /dogfood/review-queue                      — Stage 10.1 auto-approved sources awaiting human licence review

The /review/*, /dataset/*, /collection/*, /endpoint/*, /endpoints and
/integration/* and /dogfood/* routes require the X-PDQE-Review-Key header (see _require_review_key) — they expose reviewer
evidence, record decisions, and create the post-approval records that
advance a source toward publication.
"""

from __future__ import annotations

import hmac
import os
from contextlib import contextmanager
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel

from app.dogfood.runner import (
    LiveRunUnavailableError,
    get_live_pipeline_client,
    list_review_queue,
    run_corpus,
)
from app.dogfood.schemas import (
    DogfoodRunInput,
    DogfoodRunReport,
    DogfoodRunSummary,
    ReviewQueueEntry,
    resolve_corpus,
)
from app.dogfood.supabase_client import MAX_REPORT_PAGE, list_runs
from app.dataset.manager import (
    create_collection,
    create_dataset,
    get_dataset,
    link_dataset_to_collection,
    list_collection_datasets,
)
from app.dataset.schemas import (
    CollectionCreate,
    CollectionRecord,
    DatasetCollectionLink,
    DatasetCreate,
    DatasetRecord,
)
from app.endpoint.generator import generate_endpoint, get_endpoint, list_endpoints
from app.endpoint.schemas import EndpointGenerateRequest, EndpointRecord, EndpointStatus
from app.endpoint.supabase_client import MAX_LIST_PAGE as MAX_ENDPOINT_PAGE
from app.extraction.extractor import ExtractionRunResult, run_extraction
from app.integration.approver import publish_endpoint, submit_provider_approval
from app.integration.pipeline import run_endpoint_validation, run_full_pipeline, run_x402_registration
from app.integration.schemas import (
    EndpointValidationOutput,
    IntegrationPipelineOutput,
    IntegrationPipelineRequest,
    ProviderApprovalInput,
    ProviderApprovalRequest,
    SourceRefInput,
    X402RegistrationResult,
)
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

app = FastAPI(title="PDQE Pipeline", version="0.10.2")


# ── Health ──────────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "stage": "02b-layer2-sanitisation", "version": "0.10.2"}


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


# ── Stage 07 — Dataset and Collection Model ────────────────────────────────────

def _parse_uuid(value: str, name: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{name} is not a valid UUID: {exc}") from exc


@app.post(
    "/dataset/create/{source_id}",
    response_model=DatasetRecord,
    dependencies=[Depends(_require_review_key)],
)
def create_dataset_endpoint(
    source_id: str, payload: DatasetCreate | None = None
) -> DatasetRecord:
    """
    Stage 07: create a dataset from an APPROVED source and advance it to
    DATASET_CREATED.

    Body is optional. Without one, every field is derived from the source,
    its approving validation, Jev assessment and extraction. With one
    (DatasetCreate), its descriptive fields replace the derived ones; its
    source_id must match the path. Provenance (source_ids, extraction_ids,
    domain, licence_status) is always derived, never taken from the body.

    Raises HTTP 400 if the source is missing or not APPROVED, its licence is
    UNKNOWN/EXCLUDED, or the provenance chain is incomplete.
    """
    sid = _parse_uuid(source_id, "source_id")
    try:
        return create_dataset(sid, overrides=payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Dataset creation encountered an unexpected error: {exc}",
        ) from exc


@app.post(
    "/collection/create",
    response_model=CollectionRecord,
    dependencies=[Depends(_require_review_key)],
)
def create_collection_endpoint(payload: CollectionCreate) -> CollectionRecord:
    """Stage 07: create a thematic collection. HTTP 400 on a duplicate name."""
    try:
        return create_collection(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Collection creation encountered an unexpected error: {exc}",
        ) from exc


@app.post(
    "/dataset/{dataset_id}/link/{collection_id}",
    response_model=DatasetCollectionLink,
    dependencies=[Depends(_require_review_key)],
)
def link_dataset_endpoint(dataset_id: str, collection_id: str) -> DatasetCollectionLink:
    """
    Stage 07: link a dataset to a collection (idempotent). The first link
    advances the source DATASET_CREATED → COLLECTION_LINKED.
    """
    did = _parse_uuid(dataset_id, "dataset_id")
    cid = _parse_uuid(collection_id, "collection_id")
    try:
        return link_dataset_to_collection(did, cid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Dataset linking encountered an unexpected error: {exc}",
        ) from exc


@app.get(
    "/dataset/{dataset_id}",
    response_model=DatasetRecord,
    dependencies=[Depends(_require_review_key)],
)
def get_dataset_endpoint(dataset_id: str) -> DatasetRecord:
    """Stage 07: one dataset record. HTTP 404 if it does not exist."""
    did = _parse_uuid(dataset_id, "dataset_id")
    try:
        return get_dataset(did)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get(
    "/collection/{collection_id}/datasets",
    response_model=list[DatasetRecord],
    dependencies=[Depends(_require_review_key)],
)
def list_collection_datasets_endpoint(collection_id: str) -> list[DatasetRecord]:
    """Stage 07: datasets linked to a collection. HTTP 404 if the collection does not exist."""
    cid = _parse_uuid(collection_id, "collection_id")
    try:
        return list_collection_datasets(cid)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ── Stage 08 — Endpoint Generation ─────────────────────────────────────────────

@app.post(
    "/endpoint/generate/{dataset_id}",
    response_model=EndpointRecord,
    dependencies=[Depends(_require_review_key)],
)
def generate_endpoint_endpoint(
    dataset_id: str, payload: EndpointGenerateRequest | None = None
) -> EndpointRecord:
    """
    Stage 08: generate the endpoint spec for a COLLECTION_LINKED dataset and
    advance its source to ENDPOINT_GENERATED.

    Body is optional: {"collection_id": "<uuid>"} picks the primary
    collection (must be linked to the dataset). Every other field is assigned
    deterministically. The endpoint is stored as DRAFT — generation is not
    publication; Stage 09 is required before it is live or x402-queryable.

    Raises HTTP 400 if the dataset/source is missing or not COLLECTION_LINKED,
    the collection is not linked, or the dataset already has an endpoint.
    """
    did = _parse_uuid(dataset_id, "dataset_id")
    try:
        return generate_endpoint(did, payload.collection_id if payload else None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Endpoint generation encountered an unexpected error: {exc}",
        ) from exc


@app.get(
    "/endpoint/{endpoint_id}",
    response_model=EndpointRecord,
    dependencies=[Depends(_require_review_key)],
)
def get_endpoint_endpoint(endpoint_id: str) -> EndpointRecord:
    """Stage 08: one endpoint record. HTTP 404 if it does not exist."""
    eid = _parse_uuid(endpoint_id, "endpoint_id")
    try:
        return get_endpoint(eid)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get(
    "/endpoints",
    response_model=list[EndpointRecord],
    dependencies=[Depends(_require_review_key)],
)
def list_endpoints_endpoint(
    status: EndpointStatus | None = None,
    limit: int = Query(default=MAX_ENDPOINT_PAGE, ge=1, le=MAX_ENDPOINT_PAGE),
) -> list[EndpointRecord]:
    """Stage 08: endpoints, newest first, optionally filtered by ?status=."""
    try:
        return list_endpoints(status, limit)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Stage 09 — PDC Integration ─────────────────────────────────────────────────

@contextmanager
def _integration_errors(action: str):
    """Map Stage 09 errors: ValueError (rule refused) → 400, anything else → 500."""
    try:
        yield
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"{action} encountered an unexpected error: {exc}") from exc


def _approval(payload: ProviderApprovalRequest) -> ProviderApprovalInput:
    return ProviderApprovalInput(provider_wallet=payload.provider_wallet, price_usdc=payload.price_usdc)


@app.post(
    "/integration/validate/{endpoint_id}",
    response_model=EndpointValidationOutput,
    dependencies=[Depends(_require_review_key)],
)
def integration_validate_endpoint(endpoint_id: str, payload: SourceRefInput) -> EndpointValidationOutput:
    """
    Stage 09: run every automated check on a DRAFT endpoint. If all pass,
    advance ENDPOINT_GENERATED → ENDPOINT_VALIDATED (endpoint DRAFT →
    VALIDATED). A failed validation returns HTTP 200 with passed=false and
    every failing check; nothing is written.
    """
    eid = _parse_uuid(endpoint_id, "endpoint_id")
    with _integration_errors("Endpoint validation"):
        return run_endpoint_validation(eid, payload.source_id)


@app.post(
    "/integration/approve/{endpoint_id}",
    response_model=EndpointRecord,
    dependencies=[Depends(_require_review_key)],
)
def integration_approve_endpoint(endpoint_id: str, payload: ProviderApprovalRequest) -> EndpointRecord:
    """
    Stage 09: provider approval. Body: {"source_id", "provider_wallet",
    "price_usdc"?}. price_usdc may only raise the price (>= tier floor).
    Advances ENDPOINT_VALIDATED → PROVIDER_APPROVED; wallet, price and hash
    are then frozen.
    """
    eid = _parse_uuid(endpoint_id, "endpoint_id")
    with _integration_errors("Provider approval"):
        return submit_provider_approval(eid, payload.source_id, _approval(payload))


@app.post(
    "/integration/publish/{endpoint_id}",
    response_model=EndpointRecord,
    dependencies=[Depends(_require_review_key)],
)
def integration_publish_endpoint(endpoint_id: str, payload: SourceRefInput) -> EndpointRecord:
    """Stage 09: SBP admin publication. PROVIDER_APPROVED → PUBLISHED."""
    eid = _parse_uuid(endpoint_id, "endpoint_id")
    with _integration_errors("Endpoint publication"):
        return publish_endpoint(eid, payload.source_id)


@app.post(
    "/integration/register/{endpoint_id}",
    response_model=X402RegistrationResult,
    dependencies=[Depends(_require_review_key)],
)
def integration_register_endpoint(endpoint_id: str, payload: SourceRefInput) -> X402RegistrationResult:
    """
    Stage 09: register a PUBLISHED endpoint with x402 via pdc-x402-adapter and
    advance PUBLISHED → x402_QUERYABLE. Mock registration (no network call)
    unless VITE_FLAG_LIVE_RPC_ACTIVE=true at runtime.
    """
    eid = _parse_uuid(endpoint_id, "endpoint_id")
    with _integration_errors("x402 registration"):
        return run_x402_registration(eid, payload.source_id)


def _full_pipeline_enabled() -> bool:
    return os.environ.get("PDQE_ALLOW_FULL_PIPELINE", "false").strip().lower() == "true"


@app.post(
    "/integration/pipeline/{endpoint_id}",
    response_model=IntegrationPipelineOutput,
    dependencies=[Depends(_require_review_key)],
)
def integration_pipeline_endpoint(endpoint_id: str, payload: IntegrationPipelineRequest) -> IntegrationPipelineOutput:
    """
    Stage 09, testing only: validate → provider approval → publish → register
    in one call. It collapses two separate human gates (provider approval and
    SBP publication) into one request, so it is refused with HTTP 403 unless
    PDQE_ALLOW_FULL_PIPELINE=true is set on the service. Stops after
    validation (registration=null) if any check fails.
    """
    if not _full_pipeline_enabled():
        raise HTTPException(status_code=403, detail="Full integration pipeline is disabled on this service")
    eid = _parse_uuid(endpoint_id, "endpoint_id")
    with _integration_errors("Integration pipeline"):
        return run_full_pipeline(eid, payload.source_id, _approval(payload))


# ── Stage 10 — Internal Dogfooding ─────────────────────────────────────────────

@app.post(
    "/dogfood/run",
    response_model=DogfoodRunReport,
    dependencies=[Depends(_require_review_key)],
)
def dogfood_run_endpoint(payload: DogfoodRunInput) -> DogfoodRunReport:
    """
    Stage 10: run one seed corpus and return its report (synchronous).

    dry_run defaults to true: seed definitions and the licence gate are
    checked and no pipeline rows are written. The report is recorded in
    pdqe.dogfood_runs only when record_run=true. A live run (dry_run=false)
    fetches each source at runtime and calls Stages 01–08 in-process; it
    returns HTTP 501 if PDQE_DOGFOOD_OPERATOR_ID is not configured, and HTTP
    400 if DOGFOOD_AUTO_APPROVE=true outside development/staging. It never
    runs Stage 09, so provider approval and publication stay manual gates.

    Render env (documentation only — never committed as true):
      DOGFOOD_AUTO_APPROVE=false      dev-only human-review bypass
      PDQE_ENVIRONMENT=production     auto-approve honoured only for development/staging
      PDQE_DOGFOOD_OPERATOR_ID=<uuid> auth.users id recorded as registered_by

    An unknown domain is rejected with 422 by DogfoodRunInput.
    """
    client = None
    if not payload.dry_run:
        try:
            client = get_live_pipeline_client()
        except LiveRunUnavailableError as exc:
            raise HTTPException(status_code=501, detail=str(exc)) from exc
    try:
        return run_corpus(payload, write_to_db=payload.record_run, client=client)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500, detail=f"Dogfood run encountered an unexpected error: {exc}"
        ) from exc


@app.get(
    "/dogfood/report",
    response_model=list[DogfoodRunSummary],
    dependencies=[Depends(_require_review_key)],
)
def dogfood_report_endpoint(
    domain: str | None = None,
    limit: int = Query(default=5, ge=1, le=MAX_REPORT_PAGE),
) -> list[DogfoodRunSummary]:
    """Stage 10: recent recorded corpus runs, newest first, optionally for one ?domain=."""
    corpus = None
    if domain is not None:
        try:
            corpus = resolve_corpus(domain).value
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        return [DogfoodRunSummary.model_validate(row) for row in list_runs(corpus, limit)]
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get(
    "/dogfood/review-queue",
    response_model=list[ReviewQueueEntry],
    dependencies=[Depends(_require_review_key)],
)
def dogfood_review_queue_endpoint() -> list[ReviewQueueEntry]:
    """
    Stage 10.1: auto-approved sources (DOGFOOD_AUTO_APPROVE) across all
    recorded live runs whose licence has not yet been confirmed by a human,
    newest run first. Each one bypassed human review and needs attention
    before any of its endpoints can be published.
    """
    try:
        return list_review_queue()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
