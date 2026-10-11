"""
PDQE Stage 06 — Human Review Schemas.

P9 (CLAUDE.md): every input is untrusted data — reviewer input from the API
and rows read back from Supabase alike — and is validated here before any DB
write or state transition. extra="forbid" on every model.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.qualification.schemas import DomainClassification, RoutingDecision
from app.validation.schemas import ValidationOutcome, ValidatorResult

# Upper bound on a reviewer's free-text reason — long enough for a real
# rationale, short enough that the endpoint can't be used to stuff the DB.
MAX_DECISION_REASON_CHARS = 4000


class ReviewType(str, Enum):
    LICENSE_REVIEW = "LICENSE_REVIEW"
    CLASSIFICATION_REVIEW = "CLASSIFICATION_REVIEW"
    SENSITIVITY_REVIEW = "SENSITIVITY_REVIEW"
    ENRICHMENT_REVIEW = "ENRICHMENT_REVIEW"
    ENDPOINT_REVIEW = "ENDPOINT_REVIEW"
    PROVIDER_APPROVAL = "PROVIDER_APPROVAL"


class ReviewDecision(str, Enum):
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class LicenceStatus(str, Enum):
    """Mirrors pdqe.licence_status in the live DB (no COMMERCIAL value exists)."""

    UNKNOWN = "UNKNOWN"
    CLEAR = "CLEAR"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    RESTRICTED = "RESTRICTED"
    EXCLUDED = "EXCLUDED"


class ReviewContext(BaseModel):
    """
    Evidence shown to the reviewer. Never empty — every field is required
    except the source title/URL, which can legitimately be absent (and whose
    absence is itself evidence the reviewer needs to see).
    """

    model_config = ConfigDict(extra="forbid")

    # Stage 04 — Jev qualification
    stage04_assessment_id: UUID
    stage04_routing_decision: RoutingDecision
    stage04_routing_rationale: str = Field(min_length=1)
    stage04_domain_classification: DomainClassification
    stage04_classification_confidence: float = Field(ge=0.0, le=1.0)
    stage04_completeness_score: int = Field(ge=0, le=4)
    stage04_value_plausible: float = Field(ge=0.0, le=1.0)
    stage04_licence_statement_present: float = Field(ge=0.0, le=1.0)

    # Stage 05 — deterministic validation
    stage05_validation_id: UUID
    stage05_outcome: ValidationOutcome
    stage05_validators_failed: int = Field(ge=0)
    stage05_failed_validator_ids: list[str]
    stage05_outcome_reason: str = Field(min_length=1)
    stage05_validator_results: list[ValidatorResult] = Field(min_length=1)

    # Source / provenance summary
    source_title: Optional[str] = None
    source_url: Optional[str] = None
    licence_status: LicenceStatus


class ReviewQueueItem(BaseModel):
    """A queued review item — created by Stage 06 when Stage 05 routes to REVIEW."""

    model_config = ConfigDict(extra="forbid")

    source_id: UUID
    validation_id: UUID
    review_type: ReviewType
    review_context: ReviewContext
    previous_routing_decision: RoutingDecision


class EnqueueReviewInput(BaseModel):
    """Request body for POST /review/enqueue/{source_id}. P9 validated."""

    model_config = ConfigDict(extra="forbid")

    validation_id: UUID


class ReviewDecisionInput(BaseModel):
    """Input for recording a human review decision. P9 validated."""

    model_config = ConfigDict(extra="forbid")

    review_id: UUID
    decision: ReviewDecision
    decision_reason: str = Field(min_length=1, max_length=MAX_DECISION_REASON_CHARS)
    # auth.users id of the human making the decision. Recorded on
    # pdqe.human_reviews.reviewer_id and pipeline_state.actor_user_id (FK to
    # auth.users, so an unknown id fails the transition).
    reviewer_id: UUID

    @field_validator("decision_reason")
    @classmethod
    def _reason_not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("decision_reason must not be blank")
        return stripped


class ReviewRecord(BaseModel):
    """Full review record as returned from DB."""

    model_config = ConfigDict(extra="forbid")

    id: UUID
    source_id: UUID
    validation_id: UUID
    review_type: ReviewType
    review_context: dict
    reviewer_id: Optional[UUID]
    decision: Optional[ReviewDecision]
    decision_reason: Optional[str]
    previous_routing_decision: RoutingDecision
    queued_at: datetime
    reviewed_at: Optional[datetime]
