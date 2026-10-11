"""
PDQE Stage 10.1 — direct-call PipelineClient for live corpus runs.

Implements app.dogfood.runner.PipelineClient by calling the pipeline's Python
functions directly (no HTTP self-calls; the HTTP routes stay for external
callers). Stage 01 registration and Stage 02 ingestion have no module of their
own yet, so the dogfood-scoped intake for them lives here:

  Stage 01  register_source  → pdqe.sources row, DISCOVERED → SOURCE_REGISTERED
                               → LICENSE_CHECKED
  Stage 02  ingest           → pdqe.ingestion_events row, Layer 1 (Python +
                               DB trigger), Layer 2 sanitisation,
                               LICENSE_CHECKED → INGESTED
  Stage 03  extract          → app.extraction.extractor.run_extraction
  Stage 04  qualify          → app.qualification.qualifier.qualify (async)
  Stage 05  validate         → app.validation.orchestrator.run_validation
  Stage 07  create_dataset / get_or_create_collection / link_dataset
                             → app.dataset.manager
  Stage 08  generate_endpoint → app.endpoint.generator.generate_endpoint

Layer 2 is never bypassed: until Stage 02b implements run_layer2(), ingestion
raises and the source is recorded as FAILED_INGESTION. The DB still refuses
LICENSE_CHECKED → INGESTED for an UNKNOWN licence and any advance for an
EXCLUDED one — this module relies on those rules rather than re-deciding them.

Every return value is a JSON-mode dict; the runner P9-validates it through the
step projections in app.dogfood.schemas.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
from pathlib import Path
from typing import Callable, Optional
from urllib.parse import urlsplit
from uuid import UUID

from app.dataset.manager import create_collection, create_dataset, link_dataset_to_collection
from app.dataset.schemas import CollectionCreate
from app.dataset import supabase_client as dataset_db
from app.dogfood import supabase_client as db
from app.dogfood.fetcher import STRATEGY_DIRECT, FetchResult
from app.dogfood.schemas import SeedSource
from app.endpoint.generator import generate_endpoint
from app.extraction.extractor import ExtractionRunResult, run_extraction
from app.qualification.qualifier import qualify
from app.qualification.schemas import DomainClassification
from app.security.layer1_whitelist import check_layer1
from app.security.layer2_sanitisation import Layer2Result, run_layer2
from app.validation.orchestrator import run_validation

logger = logging.getLogger(__name__)

OPERATOR_ENV = "PDQE_DOGFOOD_OPERATOR_ID"

# Canonical MIME (from the fetcher) → file extension for Layer 1. .xls is not
# in the Layer 1 whitelist, so legacy Excel downloads are rejected there.
CONTENT_TYPE_EXTENSIONS = {
    "text/csv": "csv",
    "application/json": "json",
    "application/xml": "xml",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/pdf": "pdf",
    "text/plain": "txt",
}

_SOURCE_TYPES = {
    "pdf": "PDF_DOCUMENT",
    "csv": "SPREADSHEET",
    "xls": "SPREADSHEET",
    "xlsx": "SPREADSHEET",
    "json": "API_ENDPOINT",
    "xml": "API_ENDPOINT",
}


class IngestionRefused(RuntimeError):
    """A security layer refused the fetched content."""


def get_operator_id() -> UUID:
    """
    The auth.users id recorded as registered_by on every dogfood source and
    ingestion event. Required for live runs; fails closed if unset/invalid.
    """
    raw = os.getenv(OPERATOR_ENV, "").strip()
    if not raw:
        raise RuntimeError(f"{OPERATOR_ENV} must be set (an auth.users id) for live dogfood runs")
    try:
        return UUID(raw)
    except ValueError as exc:
        raise RuntimeError(f"{OPERATOR_ENV} is not a valid UUID") from exc


def file_extension_for(content_type: str) -> str:
    ext = CONTENT_TYPE_EXTENSIONS.get(content_type)
    if ext is None:
        raise IngestionRefused(f"no file extension mapping for content type {content_type!r}")
    return ext


def _publisher_from_url(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


class DirectPipelineClient:
    """PipelineClient that calls Stages 01–08 in-process."""

    def __init__(
        self,
        operator_id: UUID,
        layer2: Callable[[bytes, str], Layer2Result] = run_layer2,
    ) -> None:
        self._operator_id = str(operator_id)
        self._layer2 = layer2
        # ingestion_id → Layer 2 sanitised text, handed from ingest to extract.
        self._sanitised: dict[str, str] = {}

    # ── Stage 01 ──────────────────────────────────────────────────────────────
    def register_source(self, seed: SeedSource, fetch: Optional[FetchResult] = None) -> dict:
        ext = CONTENT_TYPE_EXTENSIONS.get(fetch.content_type) if fetch else None
        row = {
            "title": seed.title,
            "description": seed.description,
            "publisher_name": _publisher_from_url(seed.source_url),
            "source_url": seed.source_url,
            "source_type": _SOURCE_TYPES.get(ext or "", "OTHER"),
            "acquisition_method": (
                "WEB_SCRAPE" if fetch is None or fetch.fetch_strategy == STRATEGY_DIRECT else "API_PULL"
            ),
            "licence_status": seed.licence_status.value,
            "licence_url": seed.licence_url,
            "geographic_scope": seed.geography_scope,
            "candidate_domains": [seed.domain.value],
            "registered_by": self._operator_id,
            "internal_pipeline": True,
            "notes": seed.notes,
        }
        source_id = db.insert_source(row)
        db.transition_source(source_id, "SOURCE_REGISTERED", "Stage 10.1 dogfood seed registration")
        db.transition_source(
            source_id, "LICENSE_CHECKED", f"Seed licence_status {seed.licence_status.value} recorded"
        )
        return {"source_id": source_id}

    # ── Stage 02 ──────────────────────────────────────────────────────────────
    def ingest(self, source_id: UUID, seed: SeedSource, fetch: FetchResult) -> dict:
        sid = str(source_id)
        ext = file_extension_for(fetch.content_type)
        file_name = f"{Path(urlsplit(seed.source_url).path).name or 'source'}.{ext}"

        layer1 = check_layer1(file_name, ext)
        event = db.insert_ingestion_event(
            {
                "source_id": sid,
                "file_name": file_name,
                "file_extension": ext,
                "declared_mime_type": fetch.content_type,
                "file_size_bytes": fetch.size_bytes,
                "registered_by": self._operator_id,
            }
        )
        ingestion_id = str(event["ingestion_id"])
        # The DB trigger is authoritative for Layer 1; the Python check must agree.
        if not layer1.passed or event.get("layer1_passed") is False:
            raise IngestionRefused(f"Layer 1 rejected .{ext}: {layer1.rejection_reason or event.get('rejection_reason')}")

        raw = Path(fetch.local_path).read_bytes()
        try:
            result = self._layer2(raw, ext)
        except NotImplementedError as exc:
            self._fail_layer2(ingestion_id, "LAYER2_NOT_IMPLEMENTED", str(exc))
            raise IngestionRefused(f"Layer 2 sanitisation unavailable: {exc}") from exc
        if not result.passed or result.sanitised_content is None or not result.content_hash:
            reason = result.rejection_reason or "Layer 2 produced no sanitised content"
            self._fail_layer2(ingestion_id, "LAYER2_REJECTED", reason)
            raise IngestionRefused(f"Layer 2 rejected content: {reason}")
        try:
            text = result.sanitised_content.decode("utf-8")
        except UnicodeDecodeError as exc:
            self._fail_layer2(ingestion_id, "LAYER2_NOT_TEXT", "sanitised content is not UTF-8 text")
            raise IngestionRefused("Layer 2 output is not UTF-8 text") from exc

        db.log_security_check(
            ingestion_id,
            "LAYER2_SANITISATION",
            True,
            {"content_hash": result.content_hash, "raw_sha256": hashlib.sha256(raw).hexdigest()},
        )
        # UNIQUE on pdqe.sources.content_hash: duplicate content is refused here,
        # before the ingestion event is marked ready for Layer 3.
        db.set_source_content_hash(sid, result.content_hash)
        db.update_ingestion_event(
            ingestion_id, {"status": "LAYER3_PROMPT_READY", "content_hash": result.content_hash}
        )
        db.transition_source(sid, "INGESTED", "Layer 1 and Layer 2 passed", input_hash=result.content_hash)
        self._sanitised[ingestion_id] = text
        return {"ingestion_id": ingestion_id}

    def _fail_layer2(self, ingestion_id: str, code: str, message: str) -> None:
        db.log_security_check(ingestion_id, "LAYER2_SANITISATION", False, {}, code, message[:500])
        db.update_ingestion_event(ingestion_id, {"status": "LAYER2_FAILED", "rejection_reason": message[:500]})

    # ── Stages 03–05 ──────────────────────────────────────────────────────────
    def extract(self, source_id: UUID, ingestion_id: UUID, seed: SeedSource) -> dict:
        text = self._sanitised.pop(str(ingestion_id), None)
        if text is None:
            raise RuntimeError(f"no sanitised content held for ingestion {ingestion_id}")
        result: ExtractionRunResult = run_extraction(
            ingestion_id=str(ingestion_id),
            source_id=str(source_id),
            source_title=seed.title,
            sanitised_content=text,
        )
        passed = result.validation_result.passed and result.error is None
        return {
            "extraction_id": result.extraction_id,
            "passed": passed,
            "status": "VALIDATED" if passed else ("REJECTED" if result.error is None else "ERROR"),
            "rejection_reason": result.validation_result.rejection_reason,
            "error": result.error,
        }

    def qualify(self, source_id: UUID, extraction_id: UUID) -> dict:
        return asyncio.run(qualify(extraction_id)).model_dump(mode="json")

    def validate(self, source_id: UUID) -> dict:
        return run_validation(source_id).model_dump(mode="json")

    # ── Stage 07 ──────────────────────────────────────────────────────────────
    def create_dataset(self, source_id: UUID) -> dict:
        return create_dataset(source_id).model_dump(mode="json")

    def get_or_create_collection(self, name: str, domain: DomainClassification) -> dict:
        existing = dataset_db.find_collection_by_name(name)
        if existing is not None:
            return existing
        return create_collection(CollectionCreate(name=name, domain=domain)).model_dump(mode="json")

    def link_dataset(self, dataset_id: UUID, collection_id: UUID) -> dict:
        return link_dataset_to_collection(dataset_id, collection_id).model_dump(mode="json")

    # ── Stage 08 ──────────────────────────────────────────────────────────────
    def generate_endpoint(self, dataset_id: UUID, collection_id: Optional[UUID] = None) -> dict:
        return generate_endpoint(dataset_id, collection_id).model_dump(mode="json")

    # ── Dogfood-only approval bypass ──────────────────────────────────────────
    def dogfood_auto_approve(self, source_id: UUID, rationale: str) -> None:
        """VALIDATED → APPROVED via the permitted auto-approve transition."""
        db.transition_source(str(source_id), "APPROVED", rationale)
