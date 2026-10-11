"""
PDQE Stage 04 — Jev Qualification Orchestrator.

Coordinates the full Stage 04 pipeline for one validated extraction:

  Load pdqe.extractions row (must be status=VALIDATED)
    ↓
  Flatten validated_output into a text context for Jev (data only — P9)
    ↓
  Dispatch all Jev questions in parallel (one asyncio.gather per question type)
    ↓
  P9 validation of Jev output (app.qualification.schemas)
    ↓
  Deterministic threshold routing (app.qualification.thresholds)
    ↓
  Supabase write + lifecycle transition: EXTRACTED -> CLASSIFIED -> QUALIFIED

Input: extraction_id (UUID) — must reference a row in pdqe.extractions with
status=VALIDATED.
Output: JevAssessmentOutput (also written to pdqe.jev_assessments unless
write_to_db=False).
"""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from app.qualification import supabase_client as db
from app.qualification.jev_client import CURRENT_JEV_MODEL_VERSION, JevClient
from app.qualification.questions import (
    CHOICE_QUESTION,
    CURRENT_QUESTION_SET_VERSION,
    NOUL_QUESTIONS,
    SCORE_QUESTIONS,
)
from app.qualification.schemas import (
    DomainClassification,
    JevAssessmentOutput,
    JevQuestionResults,
    RoutingDecision,
    validate_assessment_output,
)
from app.qualification.thresholds import DEFAULT_THRESHOLDS, ThresholdConfig, compute_routing

logger = logging.getLogger(__name__)


def _build_jev_context(extraction: dict) -> str:
    """
    Flatten a VALIDATED pdqe.extractions row's validated_output (the stored
    app.extraction.schemas.ExtractionOutput, serialised to JSON) into a text
    context string for Jev.

    P9: this is a read-only data operation. The flattened text is treated as
    data by Jev, never as instructions — same contract as the Claude prompt
    in app.security.layer3_prompt.
    """
    validated: dict = extraction.get("validated_output") or {}
    parts: list[str] = []

    if validated.get("title"):
        parts.append(f"Title: {validated['title']}")
    if validated.get("publisher_name"):
        parts.append(f"Publisher: {validated['publisher_name']}")
    if validated.get("source_type"):
        parts.append(f"Source type: {validated['source_type']}")
    if validated.get("candidate_domains"):
        parts.append(f"Candidate domains: {', '.join(validated['candidate_domains'])}")
    if validated.get("geographic_scope"):
        parts.append(f"Geographic scope: {', '.join(validated['geographic_scope'])}")
    if validated.get("published_at"):
        parts.append(
            f"Published at: {validated['published_at']} "
            f"(date confidence: {validated.get('date_confidence', 0.0):.2f})"
        )
    if validated.get("licence_text"):
        parts.append(f"Licence: {validated['licence_text']}")
    if validated.get("licence_url"):
        parts.append(f"Licence URL: {validated['licence_url']}")
    if validated.get("methodology"):
        parts.append(f"Methodology: {validated['methodology'][:500]}")
    if validated.get("variables"):
        names = [v.get("name", "") for v in validated["variables"][:10]]
        parts.append(f"Variables: {', '.join(n for n in names if n)}")
    if validated.get("tables"):
        refs = [t.get("table_ref", "") for t in validated["tables"][:10]]
        parts.append(f"Tables: {', '.join(r for r in refs if r)}")
    if validated.get("contributing_sources"):
        parts.append(f"Contributing sources: {', '.join(validated['contributing_sources'])}")
    if validated.get("extraction_notes"):
        parts.append(f"Extraction notes: {validated['extraction_notes'][:300]}")
    parts.append(f"Extraction confidence: {validated.get('confidence', 0.0):.2f}")

    return "\n".join(parts) if parts else "No structured data available."


async def _run_all_questions(
    client: JevClient, context: str
) -> tuple[dict[str, float], dict[str, int], tuple[str, float]]:
    """Dispatch all Jev questions in parallel — one asyncio.gather per question type group."""
    noul_results: list[float] = await asyncio.gather(
        *(client.noul(q.id, q.text, context) for q in NOUL_QUESTIONS)
    )
    noul_map = {q.id: v for q, v in zip(NOUL_QUESTIONS, noul_results)}

    score_results: list[int] = await asyncio.gather(
        *(client.score(q.id, q.text, q.max_score, context) for q in SCORE_QUESTIONS)
    )
    score_map = {q.id: v for q, v in zip(SCORE_QUESTIONS, score_results)}

    choice_result = await client.choice(
        CHOICE_QUESTION.id, CHOICE_QUESTION.text, CHOICE_QUESTION.choices, context
    )

    return noul_map, score_map, choice_result


async def qualify(
    extraction_id: UUID,
    jev_client: JevClient | None = None,
    threshold_config: ThresholdConfig = DEFAULT_THRESHOLDS,
    write_to_db: bool = True,
) -> JevAssessmentOutput:
    """
    Run Stage 04 qualification for a validated extraction.

    Returns a P9-validated JevAssessmentOutput. Writes to Supabase and
    advances the lifecycle state (EXTRACTED -> CLASSIFIED -> QUALIFIED) when
    write_to_db=True.
    """
    if jev_client is None:
        jev_client = JevClient.from_env()

    extraction = db.fetch_validated_extraction(str(extraction_id))
    source_id = UUID(extraction["source_id"])

    context = _build_jev_context(extraction)
    logger.info("Running Jev qualification for extraction_id=%s source_id=%s", extraction_id, source_id)

    noul_map, score_map, (domain_value, domain_confidence) = await _run_all_questions(jev_client, context)

    # Derived completeness score — deterministic proxy from metadata_completeness,
    # not an independent Jev question (mirrored in the DB column comment).
    completeness_score = score_map["metadata_completeness"]

    question_results = JevQuestionResults(
        source_identifiable=noul_map["source_identifiable"],
        publisher_identifiable=noul_map["publisher_identifiable"],
        methodology_present=noul_map["methodology_present"],
        licence_statement_present=noul_map["licence_statement_present"],
        geography_identifiable=noul_map["geography_identifiable"],
        time_period_identifiable=noul_map["time_period_identifiable"],
        machine_readable=noul_map["machine_readable"],
        value_plausible=noul_map["value_plausible"],
        metadata_completeness=score_map["metadata_completeness"],
        provenance_completeness=score_map["provenance_completeness"],
        documentation_readiness=score_map["documentation_readiness"],
        endpoint_readiness=score_map["endpoint_readiness"],
        completeness_score=completeness_score,
        domain_classification=DomainClassification(domain_value),
        classification_confidence=domain_confidence,
    )

    routing_decision, routing_rationale = compute_routing(question_results, threshold_config)

    # P0 SAFETY: mock mode must never auto-approve.
    # Hash-based mock scores are arbitrary and carry no signal about the
    # actual source. Forcing HUMAN_REVIEW in mock mode ensures no source is
    # silently advanced without a human in the loop (P9).
    if jev_client.mock_mode:
        logger.warning(
            "JEV_MOCK_MODE=true — overriding routing_decision from %s to "
            "HUMAN_REVIEW (mock scores are not a valid basis for AUTO_APPROVE). "
            "source_id=%s",
            routing_decision.value,
            source_id,
        )
        routing_decision = RoutingDecision.HUMAN_REVIEW
        routing_rationale = (
            f"[MOCK MODE OVERRIDE] Original routing: {routing_rationale}"
        )

    raw_output = {
        "extraction_id": extraction_id,
        "source_id": source_id,
        "question_set_version": CURRENT_QUESTION_SET_VERSION,
        "threshold_config_version": threshold_config.version,
        "jev_model_version": CURRENT_JEV_MODEL_VERSION,
        "mock_mode": jev_client.mock_mode,
        "question_results": question_results.model_dump(),
        "routing_decision": routing_decision.value,
        "routing_rationale": routing_rationale,
        "auto_approve": routing_decision.value == "AUTO_APPROVE",
        "requires_human_review": routing_decision.value == "HUMAN_REVIEW",
        "requires_licence_check": routing_decision.value == "LICENCE_CHECK_REQUIRED",
    }
    output = validate_assessment_output(raw_output)

    if write_to_db:
        db.write_assessment(output)

    logger.info(
        "Stage 04 complete: extraction_id=%s routing=%s mock_mode=%s",
        extraction_id,
        routing_decision.value,
        jev_client.mock_mode,
    )
    return output
