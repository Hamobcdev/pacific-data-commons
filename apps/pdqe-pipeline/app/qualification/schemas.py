"""
PDQE Stage 04 — Jev Assessment Schemas.

P9 (CLAUDE.md): every external service output is untrusted data, validated
against a strict Pydantic schema before any downstream use. This applies to
Jev API responses exactly as it applies to Claude extraction output — nothing
from app.qualification.jev_client reaches pdqe.jev_assessments or a lifecycle
transition without passing through these models first.

extra="forbid" on every model — no passthrough of unexpected fields.
"""

from __future__ import annotations

from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DomainClassification(str, Enum):
    FISHERIES = "FISHERIES"
    CLIMATE = "CLIMATE"
    TRADE = "TRADE"
    AGRICULTURE = "AGRICULTURE"
    OCEAN = "OCEAN"
    ENVIRONMENT = "ENVIRONMENT"
    ECONOMICS = "ECONOMICS"
    GOVERNANCE = "GOVERNANCE"
    HEALTH = "HEALTH"
    TOURISM = "TOURISM"
    OTHER = "OTHER"
    NONE_OF_THE_ABOVE = "NONE_OF_THE_ABOVE"


class RoutingDecision(str, Enum):
    AUTO_APPROVE = "AUTO_APPROVE"
    HUMAN_REVIEW = "HUMAN_REVIEW"
    REJECT = "REJECT"
    LICENCE_CHECK_REQUIRED = "LICENCE_CHECK_REQUIRED"


class JevQuestionResults(BaseModel):
    """
    All Jev question results for one qualification run.

    P9: every field required — no optional nulls that could silently fail
    routing. Each noul/score/choice value here has already been range- and
    membership-validated by app.qualification.jev_client before this model
    is constructed.
    """

    model_config = ConfigDict(extra="forbid")

    # Noul questions — observable source properties (0.0-1.0 probability)
    source_identifiable: float = Field(ge=0.0, le=1.0)
    publisher_identifiable: float = Field(ge=0.0, le=1.0)
    methodology_present: float = Field(ge=0.0, le=1.0)
    licence_statement_present: float = Field(ge=0.0, le=1.0)
    geography_identifiable: float = Field(ge=0.0, le=1.0)
    time_period_identifiable: float = Field(ge=0.0, le=1.0)
    machine_readable: float = Field(ge=0.0, le=1.0)
    value_plausible: float = Field(ge=0.0, le=1.0)

    # Score questions — readiness scales (0=insufficient, 4=complete)
    metadata_completeness: int = Field(ge=0, le=4)
    provenance_completeness: int = Field(ge=0, le=4)
    documentation_readiness: int = Field(ge=0, le=4)
    endpoint_readiness: int = Field(ge=0, le=4)

    # Derived completeness score — computed from metadata_completeness by
    # deterministic code (app.qualification.qualifier), not by Jev itself.
    completeness_score: int = Field(ge=0, le=4)

    # Choice question — domain
    domain_classification: DomainClassification
    classification_confidence: float = Field(ge=0.0, le=1.0)


class JevAssessmentOutput(BaseModel):
    """
    Final output of a Stage 04 qualification run.
    Written to pdqe.jev_assessments.
    """

    model_config = ConfigDict(extra="forbid")

    extraction_id: UUID
    source_id: UUID
    question_set_version: str
    threshold_config_version: str
    jev_model_version: str
    mock_mode: bool
    question_results: JevQuestionResults
    routing_decision: RoutingDecision
    routing_rationale: str = Field(min_length=1)
    auto_approve: bool
    requires_human_review: bool
    requires_licence_check: bool


def validate_assessment_output(raw: dict) -> JevAssessmentOutput:
    """P9 gate — validates Jev-derived output before any state transition or DB write."""
    return JevAssessmentOutput.model_validate(raw)
