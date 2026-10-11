"""
PDQE Stage 03 — Extraction orchestrator.

Coordinates the full Stage 03 pipeline for one ingestion event:

  Layer 3 prompt build
    ↓
  Claude API call (claude_client)
    ↓
  Layer 4 schema validation (schemas.validate_extraction_output)
    ↓
  Supabase write (supabase_client.write_extraction)
    ↓
  Lifecycle transition: INGESTED → EXTRACTED (on validation success)

Design:
  - No automatic retry on validation failure (P9 — human decision required).
  - JSON parse errors and API errors are distinct from schema validation
    failures; both are stored for audit with appropriate status.
  - Multi-document synthesis is supported via contributing_ingestion_ids.
  - All inputs are validated before the Claude call — input_content_hash must
    be a 64-char hex string (SHA-256); an empty sanitised_content is rejected.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.extraction.claude_client import (
    ExtractionClientError,
    ExtractionOutputParseError,
    call_claude_extraction,
)
from app.extraction.schemas import ExtractionResult, validate_extraction_output
from app.extraction.supabase_client import sha256_hex, write_extraction
from app.security.layer3_prompt import build_extraction_prompt

logger = logging.getLogger(__name__)


@dataclass
class ExtractionRunResult:
    """
    Outcome of a single extraction run.

    extraction_id is populated on every run (VALIDATED and REJECTED alike),
    so the pipeline always has an audit trail.
    """

    extraction_id: str | None         # None only if the Supabase write itself failed
    validation_result: ExtractionResult
    model_id: str | None               # None if the API call failed before we got a response
    input_tokens: int | None
    output_tokens: int | None
    error: str | None                  # Set on API or parse error (not validation failure)


def run_extraction(
    *,
    ingestion_id: str,
    source_id: str,
    source_title: str,
    sanitised_content: str,
    contributing_ingestion_ids: list[str] | None = None,
    multi_doc_titles: list[str] | None = None,
) -> ExtractionRunResult:
    """
    Run a full Stage 03 extraction for one ingestion event.

    Args:
        ingestion_id:
            UUID of the pdqe.ingestion_events row being processed.
            Must have status = 'LAYER3_PROMPT_READY' or 'APPROVED'.
        source_id:
            UUID of the parent pdqe.sources row.
        source_title:
            Registered source title. Used as a reference hint in the prompt.
        sanitised_content:
            Layer 2 sanitised text. Must be non-empty. The SHA-256 of this
            content is computed here and stored as input_content_hash.
        contributing_ingestion_ids:
            For multi-document synthesis: UUIDs of all ingestion events
            contributing content. Defaults to [ingestion_id] for single-doc.
        multi_doc_titles:
            For multi-document synthesis: titles of additional source
            documents being synthesised (beyond source_title).

    Returns:
        ExtractionRunResult with extraction_id, validation result, and token
        counts. extraction_id is None only if the Supabase write itself fails.

    P9: sanitised_content is wrapped in <untrusted_document> tags by
    build_extraction_prompt(). It is never concatenated directly into SQL or
    executed as code.
    """
    if not sanitised_content.strip():
        return ExtractionRunResult(
            extraction_id=None,
            validation_result=ExtractionResult(
                passed=False,
                rejection_reason="sanitised_content is empty — nothing to extract.",
            ),
            model_id=None,
            input_tokens=None,
            output_tokens=None,
            error="empty_content",
        )

    if contributing_ingestion_ids is None:
        contributing_ingestion_ids = [ingestion_id]

    # 1. Compute content hash (ties this extraction to the exact Layer 2 output)
    input_content_hash = sha256_hex(sanitised_content)

    # 2. Build Layer 3 prompt
    prompt = build_extraction_prompt(
        sanitised_content,
        source_title,
        multi_doc_titles=multi_doc_titles,
    )

    # 3. Call Claude API
    try:
        call_result = call_claude_extraction(prompt)
    except ExtractionClientError as exc:
        logger.error("Claude API call failed. ingestion_id=%s error=%s", ingestion_id, exc)
        return ExtractionRunResult(
            extraction_id=None,
            validation_result=ExtractionResult(
                passed=False,
                rejection_reason=f"Claude API call failed: {exc}",
            ),
            model_id=None,
            input_tokens=None,
            output_tokens=None,
            error=str(exc),
        )
    except ExtractionOutputParseError as exc:
        logger.warning(
            "Claude returned non-JSON output. ingestion_id=%s", ingestion_id
        )
        # Still write the failed run to extractions for audit, using a sentinel dict
        raw_output = {"_parse_error": True, "_raw_text": exc.raw_text[:4096]}
        validation_result = ExtractionResult(
            passed=False,
            rejection_reason=f"Claude returned non-JSON output: {exc}",
        )
        extraction_id = _write_result(
            ingestion_id=ingestion_id,
            source_id=source_id,
            contributing_ingestion_ids=contributing_ingestion_ids,
            prompt=prompt,
            input_content_hash=input_content_hash,
            model_id="unknown",
            model_version=None,
            raw_output=raw_output,
            validation_result=validation_result,
        )
        return ExtractionRunResult(
            extraction_id=extraction_id,
            validation_result=validation_result,
            model_id=None,
            input_tokens=None,
            output_tokens=None,
            error=str(exc),
        )

    # 4. Layer 4 schema validation (P9 — deterministic gate)
    validation_result = validate_extraction_output(call_result.raw_output)

    if not validation_result.passed:
        logger.warning(
            "Layer 4 validation FAILED. ingestion_id=%s reason=%s",
            ingestion_id,
            validation_result.rejection_reason,
        )
    else:
        logger.info(
            "Layer 4 validation PASSED. ingestion_id=%s confidence=%.2f",
            ingestion_id,
            validation_result.extracted.confidence if validation_result.extracted else 0.0,
        )

    # 5. Write to pdqe.extractions (always — VALIDATED and REJECTED alike)
    extraction_id = _write_result(
        ingestion_id=ingestion_id,
        source_id=source_id,
        contributing_ingestion_ids=contributing_ingestion_ids,
        prompt=prompt,
        input_content_hash=input_content_hash,
        model_id=call_result.model_id,
        model_version=None,  # not returned by Anthropic messages API directly
        raw_output=call_result.raw_output,
        validation_result=validation_result,
    )

    return ExtractionRunResult(
        extraction_id=extraction_id,
        validation_result=validation_result,
        model_id=call_result.model_id,
        input_tokens=call_result.input_tokens,
        output_tokens=call_result.output_tokens,
        error=None,
    )


def _write_result(
    *,
    ingestion_id: str,
    source_id: str,
    contributing_ingestion_ids: list[str],
    prompt,
    input_content_hash: str,
    model_id: str,
    model_version: str | None,
    raw_output: dict,
    validation_result: ExtractionResult,
) -> str | None:
    """Write the extraction result to Supabase. Returns extraction_id or None on error."""
    try:
        return write_extraction(
            ingestion_id=ingestion_id,
            source_id=source_id,
            contributing_ingestion_ids=contributing_ingestion_ids,
            prompt_template_version=prompt.template_version,
            input_content_hash=input_content_hash,
            model_id=model_id,
            model_version=model_version,
            raw_claude_output=raw_output,
            validation_result=validation_result,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "Failed to write extraction to Supabase. ingestion_id=%s error=%s",
            ingestion_id,
            exc,
        )
        return None
