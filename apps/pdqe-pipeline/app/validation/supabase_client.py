"""
PDQE Stage 05 — Supabase client for deterministic validation.

Reads the source / Jev assessment / extraction a validation run needs, writes
the result to pdqe.validations, and advances the lifecycle via the Stage 05
transition RPCs (migration 20261012000001). All DB access uses
SUPABASE_SERVICE_KEY (never the anon key) — same pattern as
app.qualification.supabase_client.

Column names follow the real migrations: pdqe.sources and pdqe.extractions
are keyed on source_id / extraction_id; pdqe.jev_assessments on id.
"""

from __future__ import annotations

import logging
import os

from postgrest import APIError

from app.validation.schemas import ValidationOutcome, ValidationOutput

logger = logging.getLogger(__name__)

# Only the columns validators and the orchestrator actually read.
_SOURCE_COLUMNS = "source_id, lifecycle_state, licence_status, source_url, acquisition_method"
_ASSESSMENT_COLUMNS = "id, source_id, extraction_id, routing_decision, assessed_at"
_EXTRACTION_COLUMNS = "extraction_id, source_id, status, validated_output, provenance_map"


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


def fetch_source(source_id: str) -> dict:
    """Load a pdqe.sources row. Raises ValueError if it does not exist."""
    client = _get_client()
    try:
        response = (
            client.schema("pdqe")
            .table("sources")
            .select(_SOURCE_COLUMNS)
            .eq("source_id", source_id)
            .limit(1)
            .execute()
        )
    except APIError as exc:
        raise ValueError(f"Source {source_id} could not be loaded from pdqe.sources: {exc}") from exc

    if not response.data:
        raise ValueError(f"Source {source_id} not found in pdqe.sources")
    return response.data[0]


def fetch_latest_assessment(source_id: str) -> dict:
    """
    Load the most recent pdqe.jev_assessments row for a source.

    A source can be re-extracted and re-qualified over its lifetime
    (jev_assessments is unique per extraction, not per source), so the newest
    assessment is the one that moved the source into QUALIFIED.
    """
    client = _get_client()
    try:
        response = (
            client.schema("pdqe")
            .table("jev_assessments")
            .select(_ASSESSMENT_COLUMNS)
            .eq("source_id", source_id)
            .order("assessed_at", desc=True)
            .limit(1)
            .execute()
        )
    except APIError as exc:
        raise ValueError(f"Jev assessment for source {source_id} could not be loaded: {exc}") from exc

    if not response.data:
        raise ValueError(f"No Jev assessment found for source {source_id}")
    return response.data[0]


def fetch_extraction(extraction_id: str) -> dict:
    """Load a pdqe.extractions row by its PK. Raises ValueError if it does not exist."""
    client = _get_client()
    try:
        response = (
            client.schema("pdqe")
            .table("extractions")
            .select(_EXTRACTION_COLUMNS)
            .eq("extraction_id", extraction_id)
            .limit(1)
            .execute()
        )
    except APIError as exc:
        raise ValueError(f"Extraction {extraction_id} could not be loaded: {exc}") from exc

    if not response.data:
        raise ValueError(f"Extraction {extraction_id} not found in pdqe.extractions")
    return response.data[0]


def write_validation(output: ValidationOutput) -> dict:
    """
    Insert into pdqe.validations, then call the matching Stage 05 transition
    RPC to advance QUALIFIED → VALIDATED | REVIEW | REJECTED.

    Returns the inserted row. Raises on any error.
    """
    client = _get_client()

    row: dict = {
        "source_id": str(output.source_id),
        "assessment_id": str(output.assessment_id),
        "validator_version": output.validator_version,
        # Passed as a list, not json.dumps(): supabase-py serialises the body,
        # and a pre-serialised string would land in JSONB as a string scalar.
        "validator_results": [r.model_dump() for r in output.validator_results],
        "validators_run": output.validators_run,
        "validators_passed": output.validators_passed,
        "validators_failed": output.validators_failed,
        "outcome": output.outcome.value,
        "outcome_reason": output.outcome_reason,
        "stage04_routing_decision": output.stage04_routing_decision.value,
        "queued_for_review": output.queued_for_review,
    }

    logger.info(
        "Writing validation for source_id=%s assessment_id=%s outcome=%s",
        output.source_id,
        output.assessment_id,
        output.outcome.value,
    )

    try:
        response = client.schema("pdqe").table("validations").insert(row).execute()
    except APIError as exc:
        raise RuntimeError(f"Failed to write validation to Supabase: {exc}") from exc

    if not response.data:
        raise RuntimeError(
            f"Supabase insert to pdqe.validations returned no data for source {output.source_id}"
        )

    inserted = response.data[0]
    validation_id = inserted["id"]
    source_id = str(output.source_id)

    if output.outcome == ValidationOutcome.VALIDATED:
        rpc_name = "transition_to_validated"
        params = {"p_source_id": source_id, "p_validation_id": validation_id}
    elif output.outcome == ValidationOutcome.REVIEW:
        rpc_name = "transition_to_review"
        params = {"p_source_id": source_id, "p_reason": output.outcome_reason, "p_validation_id": validation_id}
    else:
        rpc_name = "transition_to_rejected"
        params = {"p_source_id": source_id, "p_reason": output.outcome_reason, "p_validation_id": validation_id}

    client.schema("pdqe").rpc(rpc_name, params).execute()

    logger.info("Source %s advanced to %s", output.source_id, output.outcome.value)
    return inserted
