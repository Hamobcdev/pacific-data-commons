"""
PDQE Stage 06 — Review Queue.

Builds the reviewer's evidence context from Stage 04/05 data, queues it in
pdqe.human_reviews, and records explicit human decisions.

Principle: AI performs bulk work, humans handle consequential exceptions —
never hide uncertainty to increase automation. The context carries every
validator result with its reason, not just the failures.

P9: every row loaded from Supabase is untrusted data and is re-parsed through
the strict schemas (ValidatorResult, ReviewContext, ReviewRecord) before it is
used or returned.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from pydantic import ValidationError

from app.review import supabase_client as db
from app.review.classifier import infer_review_type
from app.review.schemas import (
    ReviewContext,
    ReviewDecisionInput,
    ReviewQueueItem,
    ReviewRecord,
)
from app.validation.schemas import ValidationOutcome, ValidatorResult

logger = logging.getLogger(__name__)

MAX_PENDING_PAGE = 200


def _as_json(value: Any) -> Any:
    """JSONB can come back pre-parsed or as a string depending on the client path."""
    return json.loads(value) if isinstance(value, str) else value


def parse_validator_results(validation: dict) -> list[ValidatorResult]:
    """P9: re-validate the stored validator results before using them."""
    raw = _as_json(validation.get("validator_results"))
    if not isinstance(raw, list):
        raise ValueError(f"Validation {validation.get('id')} has malformed validator_results")
    try:
        return [ValidatorResult.model_validate(r) for r in raw]
    except ValidationError as exc:
        raise ValueError(f"Validation {validation.get('id')} has malformed validator_results: {exc}") from exc


def build_review_context(source: dict, assessment: dict, validation: dict) -> ReviewContext:
    """Build the evidence context shown to the reviewer. Never hide uncertainty."""
    results = parse_validator_results(validation)
    failed_ids = [r.validator_id for r in results if not r.passed]
    try:
        return ReviewContext(
            stage04_assessment_id=assessment["id"],
            stage04_routing_decision=assessment["routing_decision"],
            stage04_routing_rationale=assessment["routing_rationale"],
            stage04_domain_classification=assessment["domain_classification"],
            stage04_classification_confidence=float(assessment["classification_confidence"]),
            stage04_completeness_score=assessment["completeness_score"],
            stage04_value_plausible=float(assessment["value_plausible"]),
            stage04_licence_statement_present=float(assessment["licence_statement_present"]),
            stage05_validation_id=validation["id"],
            stage05_outcome=validation["outcome"],
            stage05_validators_failed=validation["validators_failed"],
            stage05_failed_validator_ids=failed_ids,
            stage05_outcome_reason=validation["outcome_reason"],
            stage05_validator_results=results,
            source_title=source.get("title"),
            source_url=source.get("source_url"),
            licence_status=source["licence_status"],
        )
    except (KeyError, TypeError, ValidationError) as exc:
        raise ValueError(f"Review context for source {source.get('source_id')} is incomplete: {exc}") from exc


def enqueue_review(source_id: UUID, validation_id: UUID, write_to_db: bool = True) -> ReviewQueueItem:
    """
    Load Stage 04/05 data for a REVIEW-state source and create a review queue item.
    Called after Stage 05 routes to REVIEW.

    Raises ValueError when the source/validation/assessment is missing, the
    source is not in REVIEW, the validation is not this source's REVIEW
    outcome, or the review is already queued.
    """
    sid = str(source_id)

    source = db.fetch_source(sid)
    if source.get("lifecycle_state") != "REVIEW":
        raise ValueError(
            f"Source {source_id} is in state '{source.get('lifecycle_state')}', Stage 06 requires REVIEW"
        )

    validation = db.fetch_validation(str(validation_id))
    if str(validation.get("source_id")) != sid:
        raise ValueError(f"Validation {validation_id} does not belong to source {source_id}")
    if validation.get("outcome") != ValidationOutcome.REVIEW.value:
        raise ValueError(
            f"Validation {validation_id} has outcome '{validation.get('outcome')}', Stage 06 requires REVIEW"
        )

    # The assessment the validation was actually run against — not merely the
    # newest one, which could belong to a later re-qualification.
    assessment = db.fetch_assessment(str(validation["assessment_id"]))
    if str(assessment.get("source_id")) != sid:
        raise ValueError(f"Assessment {assessment.get('id')} does not belong to source {source_id}")

    context = build_review_context(source, assessment, validation)
    review_type = infer_review_type(
        context.stage04_routing_decision, context.stage05_failed_validator_ids
    )

    item = ReviewQueueItem(
        source_id=source_id,
        validation_id=validation_id,
        review_type=review_type,
        review_context=context,
        previous_routing_decision=context.stage04_routing_decision,
    )

    if write_to_db:
        db.insert_review(
            {
                "source_id": sid,
                "validation_id": str(validation_id),
                "review_type": review_type.value,
                "review_context": context.model_dump(mode="json"),
                "previous_routing_decision": item.previous_routing_decision.value,
            }
        )
        logger.info("Queued review for source %s type=%s", source_id, review_type.value)

    return item


def _to_record(row: dict) -> ReviewRecord:
    """P9: parse a pdqe.human_reviews row through the strict record schema."""
    data = dict(row)
    data["review_context"] = _as_json(data.get("review_context"))
    try:
        return ReviewRecord.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"Review row {row.get('id')} failed schema validation: {exc}") from exc


def record_decision(decision_input: ReviewDecisionInput, write_to_db: bool = True) -> ReviewRecord:
    """
    Record a human reviewer's decision (APPROVED or REJECTED).

    Advances REVIEW → APPROVED | REJECTED via the transition function, which
    re-checks every precondition under a row lock — the pending check here is
    for a clear error message, not the enforcement point.

    With write_to_db=False nothing is written; the returned record shows the
    decision as it would be recorded.
    """
    rid = str(decision_input.review_id)
    review = _to_record(db.fetch_review(rid))
    if review.decision is not None:
        raise ValueError(f"Review {rid} already has a decision: {review.decision.value}")

    if not write_to_db:
        return review.model_copy(
            update={
                "decision": decision_input.decision,
                "decision_reason": decision_input.decision_reason,
                "reviewer_id": decision_input.reviewer_id,
                "reviewed_at": datetime.now(timezone.utc),
            }
        )

    db.call_decision_rpc(
        decision_input.decision,
        source_id=str(review.source_id),
        review_id=rid,
        reason=decision_input.decision_reason,
        reviewer_id=str(decision_input.reviewer_id),
    )
    return _to_record(db.fetch_review(rid))


def list_pending_reviews(limit: int = MAX_PENDING_PAGE) -> list[ReviewRecord]:
    """Return pending (decision IS NULL) reviews, newest first."""
    if not 1 <= limit <= MAX_PENDING_PAGE:
        raise ValueError(f"limit must be between 1 and {MAX_PENDING_PAGE}")
    return [_to_record(row) for row in db.list_pending(limit)]

