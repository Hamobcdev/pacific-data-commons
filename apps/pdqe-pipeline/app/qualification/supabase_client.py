"""
PDQE Stage 04 — Supabase write client for Jev assessments.

Writes the assessment result to pdqe.jev_assessments, then advances the
lifecycle state EXTRACTED -> CLASSIFIED -> QUALIFIED via the two Stage 04
transition RPCs (migration 20261011000001). All DB writes use
SUPABASE_SERVICE_KEY (never the anon key) — same pattern as
app.extraction.supabase_client.
"""

from __future__ import annotations

import logging
import os

from postgrest import APIError

from app.qualification.schemas import JevAssessmentOutput

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


def fetch_validated_extraction(extraction_id: str) -> dict:
    """
    Load a VALIDATED extraction row from pdqe.extractions by its primary key
    (extraction_id — NOT the FK-named "source_id"/"ingestion_id" columns on
    other tables; pdqe.extractions.extraction_id is this table's own PK,
    per migration 20261008000006).

    Raises ValueError if the row does not exist or is not status=VALIDATED —
    Stage 04 only qualifies extractions that passed Layer 4 validation.
    """
    client = _get_client()

    try:
        response = (
            client.schema("pdqe")
            .table("extractions")
            .select("extraction_id, source_id, validated_output, status")
            .eq("extraction_id", extraction_id)
            .single()
            .execute()
        )
    except APIError as exc:
        raise ValueError(f"Extraction {extraction_id} not found in pdqe.extractions: {exc}") from exc

    row = response.data
    if not row:
        raise ValueError(f"Extraction {extraction_id} not found in pdqe.extractions")

    if row["status"] != "VALIDATED":
        raise ValueError(
            f"Extraction {extraction_id} has status '{row['status']}' — "
            "Stage 04 requires status='VALIDATED'"
        )

    return row


def write_assessment(output: JevAssessmentOutput) -> dict:
    """
    Write assessment to pdqe.jev_assessments, then call the Stage 04
    transition functions to advance state: EXTRACTED -> CLASSIFIED -> QUALIFIED.

    Returns the inserted row. Raises on any error — caller is responsible for
    audit on failure (the extraction row already exists; a failed assessment
    write is recoverable by re-running qualification for the same extraction).
    """
    client = _get_client()
    qr = output.question_results

    row: dict = {
        "extraction_id": str(output.extraction_id),
        "source_id": str(output.source_id),
        "question_set_version": output.question_set_version,
        "threshold_config_version": output.threshold_config_version,
        "jev_model_version": output.jev_model_version,
        "mock_mode": output.mock_mode,
        # Noul
        "source_identifiable": qr.source_identifiable,
        "publisher_identifiable": qr.publisher_identifiable,
        "methodology_present": qr.methodology_present,
        "licence_statement_present": qr.licence_statement_present,
        "geography_identifiable": qr.geography_identifiable,
        "time_period_identifiable": qr.time_period_identifiable,
        "machine_readable": qr.machine_readable,
        "value_plausible": qr.value_plausible,
        # Score
        "metadata_completeness": qr.metadata_completeness,
        "provenance_completeness": qr.provenance_completeness,
        "documentation_readiness": qr.documentation_readiness,
        "endpoint_readiness": qr.endpoint_readiness,
        "completeness_score": qr.completeness_score,
        # Choice
        "domain_classification": qr.domain_classification.value,
        "classification_confidence": qr.classification_confidence,
        # Routing
        "routing_decision": output.routing_decision.value,
        "routing_rationale": output.routing_rationale,
    }

    logger.info(
        "Writing Jev assessment for source_id=%s extraction_id=%s routing=%s",
        output.source_id,
        output.extraction_id,
        output.routing_decision.value,
    )

    try:
        response = client.schema("pdqe").table("jev_assessments").insert(row).execute()
    except APIError as exc:
        raise RuntimeError(f"Failed to write Jev assessment to Supabase: {exc}") from exc

    if not response.data:
        raise RuntimeError(
            f"Supabase insert to pdqe.jev_assessments returned no data for source {output.source_id}"
        )

    inserted = response.data[0]
    assessment_id = inserted["id"]

    client.schema("pdqe").rpc(
        "transition_to_classified",
        {"p_source_id": str(output.source_id), "p_extraction_id": str(output.extraction_id)},
    ).execute()

    client.schema("pdqe").rpc(
        "transition_to_qualified",
        {
            "p_source_id": str(output.source_id),
            "p_routing_decision": output.routing_decision.value,
            "p_assessment_id": assessment_id,
        },
    ).execute()

    logger.info(
        "Source %s advanced to QUALIFIED (routing=%s)", output.source_id, output.routing_decision.value
    )
    return inserted
