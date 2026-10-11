"""
PDQE Stage 04 — Qualification Thresholds.

All thresholds configurable. Higher-consequence decisions (licensing,
sensitive data) require higher confidence and/or mandatory human review.
Version this config so assessments are reproducible — threshold_config_version
is written to every pdqe.jev_assessments row.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.qualification.schemas import JevQuestionResults, RoutingDecision

CURRENT_THRESHOLD_VERSION = "v1.0"


@dataclass(frozen=True)
class ThresholdConfig:
    """Configurable routing thresholds. Frozen — never mutate at runtime."""

    version: str = CURRENT_THRESHOLD_VERSION

    # AUTO_APPROVE gate (both must be met)
    auto_approve_completeness_min: int = 2  # metadata_completeness >= 2
    auto_approve_value_plausible_min: float = 0.85  # value_plausible >= 0.85

    # REJECT gate (completeness_score == 0 -> always reject)
    reject_completeness_max: int = 0

    # LICENCE_CHECK gate — licence_statement_present below this -> manual check required
    licence_clear_min: float = 0.70

    # High-consequence confidence minimum (reserved for future high-stakes routing)
    high_consequence_min_confidence: float = 0.85


DEFAULT_THRESHOLDS = ThresholdConfig()


def compute_routing(
    results: JevQuestionResults,
    config: ThresholdConfig = DEFAULT_THRESHOLDS,
) -> tuple[RoutingDecision, str]:
    """
    Deterministic routing logic. Jev returns scores; this function applies
    thresholds — Jev never decides routing itself.

    Returns (RoutingDecision, rationale string).

    Order matters: REJECT checked first, then LICENCE_CHECK, then
    AUTO_APPROVE, default HUMAN_REVIEW.
    """
    # 1. REJECT: completeness_score == 0 — insufficient information, do not
    #    queue for review.
    if results.completeness_score <= config.reject_completeness_max:
        return (
            RoutingDecision.REJECT,
            f"Completeness score {results.completeness_score} — insufficient information to proceed. "
            "Source will not be queued for human review.",
        )

    # 2. LICENCE_CHECK: licence clarity below threshold — needs manual review
    #    before proceeding.
    if results.licence_statement_present < config.licence_clear_min:
        return (
            RoutingDecision.LICENCE_CHECK_REQUIRED,
            f"Licence statement probability {results.licence_statement_present:.2f} < "
            f"threshold {config.licence_clear_min:.2f}. Manual licence check required before "
            "qualification can advance.",
        )

    # 3. AUTO_APPROVE: completeness >= min AND value_plausible >= min
    if (
        results.metadata_completeness >= config.auto_approve_completeness_min
        and results.value_plausible >= config.auto_approve_value_plausible_min
    ):
        return (
            RoutingDecision.AUTO_APPROVE,
            f"Auto-approve: metadata_completeness={results.metadata_completeness} >= "
            f"{config.auto_approve_completeness_min}, value_plausible={results.value_plausible:.2f} >= "
            f"{config.auto_approve_value_plausible_min:.2f}.",
        )

    # 4. Default: HUMAN_REVIEW
    return (
        RoutingDecision.HUMAN_REVIEW,
        f"Human review required: metadata_completeness={results.metadata_completeness} "
        f"(min {config.auto_approve_completeness_min}) or "
        f"value_plausible={results.value_plausible:.2f} "
        f"(min {config.auto_approve_value_plausible_min:.2f}) did not meet auto-approve thresholds.",
    )
