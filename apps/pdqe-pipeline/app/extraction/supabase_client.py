"""
PDQE Stage 03 — Supabase write client for pdqe.extractions.

Writes extraction results and triggers the INGESTED → EXTRACTED lifecycle
transition via pdqe.transition_to_extracted().

All writes go via the service_role key (full RLS bypass). This module never
reads provider data, never touches payment tables, and never reads
pdqe.upload_security_log (append-only audit log).

Environment variables required:
  SUPABASE_URL          — project URL
  SUPABASE_SERVICE_KEY  — service role key (classified — never commit)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from uuid import UUID

from postgrest import APIError

from app.extraction.schemas import ExtractionOutput, ExtractionResult

logger = logging.getLogger(__name__)


def _get_client():  # type: ignore[return]
    """
    Return a Supabase client using the service role key.

    Import is deferred so tests that mock this module don't need a live
    Supabase connection.
    """
    try:
        from supabase import create_client  # type: ignore[import]
    except ImportError as exc:
        raise RuntimeError(
            "supabase-py is not installed. Add 'supabase' to requirements.txt."
        ) from exc

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment variables."
        )

    return create_client(url, key)


def write_extraction(
    *,
    ingestion_id: str,
    source_id: str,
    contributing_ingestion_ids: list[str],
    prompt_template_version: str,
    input_content_hash: str,
    model_id: str,
    model_version: str | None,
    raw_claude_output: dict,
    validation_result: ExtractionResult,
) -> str:
    """
    Write a single extraction result to pdqe.extractions.

    Returns the new extraction_id (UUID string).

    On VALIDATED output, also calls pdqe.transition_to_extracted() to advance
    the source lifecycle state.

    P9: raw_claude_output is stored as JSONB data — it is never executed or
    interpreted as instructions by this function.
    """
    client = _get_client()

    # Build the row payload
    row: dict = {
        "ingestion_id": ingestion_id,
        "source_id": source_id,
        "contributing_ingestion_ids": contributing_ingestion_ids,
        "schema_version": "pdqe-extraction-v1",
        "prompt_template_version": prompt_template_version,
        "input_content_hash": input_content_hash,
        "model_id": model_id,
        "model_version": model_version,
        "raw_claude_output": raw_claude_output,
        "status": "VALIDATED" if validation_result.passed else "REJECTED",
        "rejection_reason": validation_result.rejection_reason,
    }

    if validation_result.passed and validation_result.extracted is not None:
        ex: ExtractionOutput = validation_result.extracted
        row.update(
            {
                "validated_output": ex.model_dump(mode="json"),
                # Denormalised fields for Stage 04 filtering
                "title": ex.title,
                "publisher_name": ex.publisher_name,
                "source_type_extracted": ex.source_type,
                "candidate_domains": list(ex.candidate_domains),
                "geographic_scope": list(ex.geographic_scope),
                "published_at_extracted": ex.published_at,
                "licence_text": ex.licence_text,
                "licence_url": ex.licence_url,
                "methodology": ex.methodology,
                "confidence": ex.confidence,
                "extraction_notes": ex.extraction_notes,
                # Sub-objects
                "provenance_map": {
                    k: v.model_dump(mode="json") for k, v in ex.provenance.items()
                },
                "variables_extracted": [
                    v.model_dump(mode="json") for v in ex.variables
                ],
                "tables_extracted": [
                    t.model_dump(mode="json") for t in ex.tables
                ],
            }
        )

    try:
        response = (
            client.schema("pdqe")
            .table("extractions")
            .insert(row)
            .execute()
        )
    except APIError as exc:
        raise RuntimeError(f"Failed to write extraction to Supabase: {exc}") from exc

    if not response.data:
        raise RuntimeError("Supabase insert returned no data — extraction may not have been written.")

    extraction_id: str = response.data[0]["extraction_id"]
    logger.info(
        "Wrote extraction. extraction_id=%s status=%s",
        extraction_id,
        row["status"],
    )

    # Advance lifecycle state if VALIDATED
    if validation_result.passed:
        _transition_to_extracted(
            client=client,
            source_id=source_id,
            extraction_id=extraction_id,
            model_id=model_id,
            confidence=validation_result.extracted.confidence if validation_result.extracted else None,
        )

    return extraction_id


def _transition_to_extracted(
    *,
    client,
    source_id: str,
    extraction_id: str,
    model_id: str,
    confidence: float | None,
) -> None:
    """
    Call pdqe.transition_to_extracted() to advance source lifecycle state.
    Errors are logged but do not raise — the extraction record is already
    written; a failed transition is recoverable via admin tooling.
    """
    try:
        client.schema("pdqe").rpc(
            "transition_to_extracted",
            {
                "p_source_id": source_id,
                "p_extraction_id": extraction_id,
                "p_model_id": model_id,
                "p_confidence": confidence,
            },
        ).execute()
        logger.info(
            "Lifecycle state advanced to EXTRACTED. source_id=%s", source_id
        )
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "Failed to transition source to EXTRACTED — extraction is written "
            "but lifecycle state was NOT advanced. source_id=%s error=%s",
            source_id,
            exc,
        )


def sha256_hex(content: str) -> str:
    """Return the SHA-256 hex digest of a UTF-8 string."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()
