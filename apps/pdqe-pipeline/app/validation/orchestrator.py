"""
PDQE Stage 05 — Orchestrator.

Loads source + latest Jev assessment + extraction from Supabase, checks the
source is QUALIFIED, and runs the deterministic validation engine.
Entry point for POST /validate/{source_id}.

P9: every row loaded here is untrusted data. The Stage 04 routing decision is
re-parsed through the RoutingDecision enum, and the assessment/extraction are
checked to belong to the source being validated, before anything downstream
uses them.
"""

from __future__ import annotations

import logging
from uuid import UUID

from app.qualification.schemas import RoutingDecision
from app.validation import supabase_client as db
from app.validation.engine import validate
from app.validation.schemas import ValidationOutput

logger = logging.getLogger(__name__)


def run_validation(source_id: UUID, write_to_db: bool = True) -> ValidationOutput:
    """
    Full Stage 05 run for a QUALIFIED source.

    Raises ValueError when the source, assessment, or extraction is missing,
    the source is not QUALIFIED, the rows don't belong together, or the
    stored routing decision is not a known value.
    """
    sid = str(source_id)

    source = db.fetch_source(sid)
    if source.get("lifecycle_state") != "QUALIFIED":
        raise ValueError(
            f"Source {source_id} is in state '{source.get('lifecycle_state')}', "
            "Stage 05 requires QUALIFIED"
        )

    assessment = db.fetch_latest_assessment(sid)
    if str(assessment.get("source_id")) != sid:
        raise ValueError(f"Assessment {assessment.get('id')} does not belong to source {source_id}")

    try:
        routing_decision = RoutingDecision(assessment.get("routing_decision"))
    except ValueError as exc:
        raise ValueError(
            f"Assessment {assessment.get('id')} has unrecognised routing_decision "
            f"{assessment.get('routing_decision')!r}"
        ) from exc

    extraction = db.fetch_extraction(str(assessment["extraction_id"]))
    if str(extraction.get("source_id")) != sid:
        raise ValueError(
            f"Extraction {extraction.get('extraction_id')} does not belong to source {source_id}"
        )

    return validate(
        source_id=source_id,
        assessment_id=UUID(str(assessment["id"])),
        extraction=extraction,
        source=source,
        routing_decision=routing_decision,
        write_to_db=write_to_db,
    )
