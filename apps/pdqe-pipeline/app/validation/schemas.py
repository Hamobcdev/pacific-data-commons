"""
PDQE Stage 05 — Validation Schemas.

P9 (CLAUDE.md): every output is validated here before any state transition
or DB write. extra="forbid" on every model — no passthrough of unexpected
fields. Cross-field invariants (counts, queue flag) are enforced by a model
validator so an internally inconsistent result can never reach
pdqe.validations — the table's CHECK constraints mirror the same rules.
"""

from __future__ import annotations

from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.qualification.schemas import RoutingDecision


class ValidationOutcome(str, Enum):
    VALIDATED = "VALIDATED"
    REVIEW = "REVIEW"
    REJECTED = "REJECTED"


class ValidatorResult(BaseModel):
    """Result of a single deterministic validator."""

    model_config = ConfigDict(extra="forbid")

    validator_id: str = Field(min_length=1)
    passed: bool
    reason: str = Field(min_length=1)


class ValidationOutput(BaseModel):
    """
    Final output of a Stage 05 validation run.
    Written to pdqe.validations.
    Outcome set by deterministic code only — never by a model.
    """

    model_config = ConfigDict(extra="forbid")

    source_id: UUID
    assessment_id: UUID
    validator_version: str = Field(min_length=1)
    validator_results: list[ValidatorResult]
    validators_run: int = Field(ge=0)
    validators_passed: int = Field(ge=0)
    validators_failed: int = Field(ge=0)
    outcome: ValidationOutcome
    outcome_reason: str = Field(min_length=1)
    stage04_routing_decision: RoutingDecision
    queued_for_review: bool

    @model_validator(mode="after")
    def _check_invariants(self) -> "ValidationOutput":
        if self.validators_run != len(self.validator_results):
            raise ValueError(
                f"validators_run={self.validators_run} but {len(self.validator_results)} results recorded"
            )
        if self.validators_run != self.validators_passed + self.validators_failed:
            raise ValueError("validators_run must equal validators_passed + validators_failed")
        actual_passed = sum(1 for r in self.validator_results if r.passed)
        if actual_passed != self.validators_passed:
            raise ValueError(
                f"validators_passed={self.validators_passed} but {actual_passed} results passed"
            )
        ids = [r.validator_id for r in self.validator_results]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate validator_id in validator_results")
        if self.queued_for_review != (self.outcome == ValidationOutcome.REVIEW):
            raise ValueError("queued_for_review must be True iff outcome is REVIEW")
        if self.outcome == ValidationOutcome.VALIDATED and (
            self.validators_failed > 0
            or self.stage04_routing_decision != RoutingDecision.AUTO_APPROVE
        ):
            raise ValueError(
                "VALIDATED requires AUTO_APPROVE routing and zero validator failures"
            )
        return self


def validate_validation_output(raw: dict) -> ValidationOutput:
    """P9 gate — validates before any state transition or DB write."""
    return ValidationOutput.model_validate(raw)
