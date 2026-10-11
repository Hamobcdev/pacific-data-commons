"""
PDQE Stage 05 — Validation Engine.

Runs every deterministic validator, combines the results with the Stage 04
routing decision, and produces a P9-validated ValidationOutput.

Core principle: never rely on a model to validate its own output. Nothing in
this module calls a model; the outcome is a pure function of the Stage 04
routing decision and the validator results.
"""

from __future__ import annotations

import logging
from uuid import UUID

from app.qualification.schemas import RoutingDecision
from app.validation import supabase_client as db
from app.validation.schemas import (
    ValidationOutcome,
    ValidationOutput,
    ValidatorResult,
    validate_validation_output,
)
from app.validation.validators import CURRENT_VALIDATOR_VERSION, VALIDATOR_REGISTRY

logger = logging.getLogger(__name__)


def run_validators(extraction: dict, source: dict) -> list[ValidatorResult]:
    """
    Run every registered validator. A validator that raises fails closed: it
    is recorded as a failure (which can only downgrade, never upgrade, the
    outcome) instead of aborting the run.
    """
    results: list[ValidatorResult] = []
    for validator_fn in VALIDATOR_REGISTRY:
        try:
            results.append(validator_fn(extraction, source))
        except Exception as exc:  # noqa: BLE001 — fail closed on any validator error
            validator_id = validator_fn.__name__.removeprefix("validate_")
            logger.exception("Validator %s raised", validator_id)
            results.append(
                ValidatorResult(
                    validator_id=validator_id,
                    passed=False,
                    reason=f"Validator raised {type(exc).__name__} — treated as failure",
                )
            )
    return results


def compute_outcome(
    routing_decision: RoutingDecision,
    validator_results: list[ValidatorResult],
) -> tuple[ValidationOutcome, str, bool]:
    """
    Deterministic outcome from the Stage 04 routing decision + validator results.
    Returns (outcome, reason, queued_for_review).

    Rules, in priority order:
      1. REJECT routing                        → REJECTED
      2. licence_not_excluded failed           → REJECTED (whatever the routing)
      3. AUTO_APPROVE + every validator passed → VALIDATED
      4. AUTO_APPROVE + any validator failed   → REVIEW (never a silent pass)
      5. HUMAN_REVIEW / LICENCE_CHECK_REQUIRED → REVIEW
    """
    routing_decision = RoutingDecision(routing_decision)

    if routing_decision == RoutingDecision.REJECT:
        return (
            ValidationOutcome.REJECTED,
            "Stage 04 routing decision: REJECT. Insufficient data to proceed.",
            False,
        )

    excluded_fail = next(
        (r for r in validator_results if r.validator_id == "licence_not_excluded" and not r.passed),
        None,
    )
    if excluded_fail is not None:
        return (ValidationOutcome.REJECTED, f"Licence EXCLUDED: {excluded_fail.reason}", False)

    failed = [r for r in validator_results if not r.passed]

    if routing_decision == RoutingDecision.AUTO_APPROVE:
        if not failed:
            return (
                ValidationOutcome.VALIDATED,
                f"All {len(validator_results)} validators passed. AUTO_APPROVE path confirmed.",
                False,
            )
        failure_summary = ", ".join(r.validator_id for r in failed)
        return (
            ValidationOutcome.REVIEW,
            f"AUTO_APPROVE downgraded to REVIEW: {len(failed)} validator(s) failed "
            f"({failure_summary}). Human review required.",
            True,
        )

    if failed:
        detail = f" {len(failed)} validator(s) also failed ({', '.join(r.validator_id for r in failed)})."
    else:
        detail = " Validators passed."
    return (
        ValidationOutcome.REVIEW,
        f"Stage 04 routing: {routing_decision.value}.{detail} Queued for human review.",
        True,
    )


def validate(
    source_id: UUID,
    assessment_id: UUID,
    extraction: dict,
    source: dict,
    routing_decision: RoutingDecision,
    write_to_db: bool = True,
) -> ValidationOutput:
    """
    Run Stage 05 validation for one qualified source.

    Validators run on every path except REJECT. Returns a P9-validated
    ValidationOutput; when write_to_db=True it is written to pdqe.validations
    and the lifecycle is advanced QUALIFIED → VALIDATED | REVIEW | REJECTED.
    """
    routing_decision = RoutingDecision(routing_decision)
    logger.info("Stage 05 validation: source_id=%s routing=%s", source_id, routing_decision.value)

    if routing_decision == RoutingDecision.REJECT:
        validator_results: list[ValidatorResult] = []
    else:
        validator_results = run_validators(extraction, source)

    passed = sum(1 for r in validator_results if r.passed)
    outcome, reason, queued = compute_outcome(routing_decision, validator_results)

    output = validate_validation_output(
        {
            "source_id": source_id,
            "assessment_id": assessment_id,
            "validator_version": CURRENT_VALIDATOR_VERSION,
            "validator_results": [r.model_dump() for r in validator_results],
            "validators_run": len(validator_results),
            "validators_passed": passed,
            "validators_failed": len(validator_results) - passed,
            "outcome": outcome.value,
            "outcome_reason": reason,
            "stage04_routing_decision": routing_decision.value,
            "queued_for_review": queued,
        }
    )

    if write_to_db:
        db.write_validation(output)

    logger.info(
        "Stage 05 complete: source_id=%s outcome=%s validators=%d/%d",
        source_id,
        outcome.value,
        passed,
        len(validator_results),
    )
    return output
