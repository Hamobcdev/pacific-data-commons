"""
PDQE Stage 06 — Supabase client for the human review queue.

Reads the source / Jev assessment / validation a review needs, writes queue
rows to pdqe.human_reviews, and records decisions via the Stage 06
transition RPCs (migration 20261012000002). All DB access uses
SUPABASE_SERVICE_KEY — same client factory as Stage 05.

Decisions are never written with a direct UPDATE: the transition functions
record the decision, the lifecycle transition, and the audit event
atomically, and a DB trigger rejects any other decision write.
"""

from __future__ import annotations

import logging

from postgrest import APIError

from app.review.schemas import ReviewDecision
from app.validation.supabase_client import _get_client

logger = logging.getLogger(__name__)

_SOURCE_COLUMNS = "source_id, title, source_url, lifecycle_state, licence_status"
_ASSESSMENT_COLUMNS = (
    "id, source_id, routing_decision, routing_rationale, domain_classification, "
    "classification_confidence, completeness_score, value_plausible, "
    "licence_statement_present, assessed_at"
)
_VALIDATION_COLUMNS = (
    "id, source_id, assessment_id, outcome, outcome_reason, validators_failed, "
    "validator_results, stage04_routing_decision"
)
_REVIEW_COLUMNS = (
    "id, source_id, validation_id, review_type, review_context, reviewer_id, "
    "decision, decision_reason, previous_routing_decision, queued_at, reviewed_at"
)

_DECISION_RPC = {
    ReviewDecision.APPROVED: "transition_to_approved",
    ReviewDecision.REJECTED: "transition_to_rejected_by_reviewer",
}


def _fetch_one(table: str, columns: str, key: str, value: str, what: str) -> dict:
    client = _get_client()
    try:
        response = (
            client.schema("pdqe").table(table).select(columns).eq(key, value).limit(1).execute()
        )
    except APIError as exc:
        raise ValueError(f"{what} {value} could not be loaded from pdqe.{table}: {exc}") from exc
    if not response.data:
        raise ValueError(f"{what} {value} not found in pdqe.{table}")
    return response.data[0]


def fetch_source(source_id: str) -> dict:
    """Load a pdqe.sources row. Raises ValueError if it does not exist."""
    return _fetch_one("sources", _SOURCE_COLUMNS, "source_id", source_id, "Source")


def fetch_assessment(assessment_id: str) -> dict:
    """Load the pdqe.jev_assessments row a validation was run against."""
    return _fetch_one("jev_assessments", _ASSESSMENT_COLUMNS, "id", assessment_id, "Assessment")


def fetch_validation(validation_id: str) -> dict:
    """Load a pdqe.validations row. Raises ValueError if it does not exist."""
    return _fetch_one("validations", _VALIDATION_COLUMNS, "id", validation_id, "Validation")


def fetch_review(review_id: str) -> dict:
    """Load a pdqe.human_reviews row. Raises ValueError if it does not exist."""
    return _fetch_one("human_reviews", _REVIEW_COLUMNS, "id", review_id, "Review")


def insert_review(row: dict) -> dict:
    """
    Insert a queue row into pdqe.human_reviews. The DB trigger re-checks that
    the source is in REVIEW and the validation is its REVIEW outcome, and the
    unique constraints stop a second queue row for the same validation/source.
    """
    client = _get_client()
    try:
        response = client.schema("pdqe").table("human_reviews").insert(row).execute()
    except APIError as exc:
        raise ValueError(f"Review could not be queued for source {row.get('source_id')}: {exc}") from exc
    if not response.data:
        raise RuntimeError(
            f"Supabase insert to pdqe.human_reviews returned no data for source {row.get('source_id')}"
        )
    return response.data[0]


def call_decision_rpc(
    decision: ReviewDecision,
    source_id: str,
    review_id: str,
    reason: str,
    reviewer_id: str,
) -> None:
    """Record a decision via the matching Stage 06 transition function."""
    client = _get_client()
    rpc_name = _DECISION_RPC[decision]
    try:
        client.schema("pdqe").rpc(
            rpc_name,
            {
                "p_source_id": source_id,
                "p_review_id": review_id,
                "p_reason": reason,
                "p_reviewer_id": reviewer_id,
            },
        ).execute()
    except APIError as exc:
        # The function raises for every business-rule refusal (already decided,
        # wrong state, licence UNKNOWN/EXCLUDED, unknown reviewer) — surface
        # those as client errors, not server faults.
        raise ValueError(f"{rpc_name} refused for review {review_id}: {exc}") from exc
    logger.info("Review %s recorded as %s for source %s", review_id, decision.value, source_id)


def list_pending(limit: int) -> list[dict]:
    """Pending (decision IS NULL) reviews, newest first."""
    client = _get_client()
    response = (
        client.schema("pdqe")
        .table("human_reviews")
        .select(_REVIEW_COLUMNS)
        .is_("decision", "null")
        .order("queued_at", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data or []
