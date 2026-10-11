"""
PDQE Stage 06 — Review type inference.

Deterministic — no model involved. Validator ids are the ones emitted by
app.validation.validators (VALIDATOR_REGISTRY).
"""

from __future__ import annotations

from app.qualification.schemas import RoutingDecision
from app.review.schemas import ReviewType

_LICENCE_VALIDATORS = frozenset({"licence_not_excluded", "licence_confirmed"})
_ENRICHMENT_VALIDATORS = frozenset({"source_url", "title_present", "provenance_present"})


def infer_review_type(
    routing_decision: RoutingDecision | str,
    failed_validator_ids: list[str],
) -> ReviewType:
    """
    Infer the most appropriate review type from the Stage 04 routing decision
    and the Stage 05 failed validators.

    Priority follows consequence level: licence questions first (a licence
    problem blocks publication outright), then possible prompt injection
    (sensitivity), then the Stage 04 HUMAN_REVIEW sub-cases. ENRICHMENT_REVIEW
    is the fallback — e.g. an AUTO_APPROVE source downgraded by a missing
    field. ENDPOINT_REVIEW and PROVIDER_APPROVAL are never inferred here: they
    belong to later stages (endpoint generation, Stage 11 provider path).
    """
    routing = RoutingDecision(routing_decision)
    failed = set(failed_validator_ids)

    if routing == RoutingDecision.LICENCE_CHECK_REQUIRED:
        return ReviewType.LICENSE_REVIEW
    if failed & _LICENCE_VALIDATORS:
        return ReviewType.LICENSE_REVIEW
    if "no_prompt_injection" in failed:
        return ReviewType.SENSITIVITY_REVIEW
    if routing == RoutingDecision.HUMAN_REVIEW:
        if failed & _ENRICHMENT_VALIDATORS:
            return ReviewType.ENRICHMENT_REVIEW
        return ReviewType.CLASSIFICATION_REVIEW
    return ReviewType.ENRICHMENT_REVIEW
