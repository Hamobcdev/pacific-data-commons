"""
PDQE Stage 04 — Jev Qualification tests.

Covers:
  1. Noul question results — range validation, dispatch, determinism (P9)
  2. Score question results — range validation, dispatch, completeness derivation
  3. Choice question results — domain validity, confidence range
  4. Threshold routing — all four routing paths and their priority order
  5. Full qualification run — orchestration, DB write, state machine, no-write flag
  6. P9 + version reproducibility — schema strictness, version pinning

All tests run with JEV_MOCK_MODE=true (deterministic mock — no live TypeSafe
API calls). All Supabase writes are mocked — no live DB connection.

Async Jev/qualifier calls are driven with asyncio.run() from plain `def`
tests rather than async test functions, so no pytest-asyncio plugin
configuration (asyncio_mode, markers) is required.
"""

from __future__ import annotations

import asyncio
import os
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

os.environ["JEV_MOCK_MODE"] = "true"

from app.qualification import qualifier, supabase_client as db  # noqa: E402
from app.qualification.jev_client import CURRENT_JEV_MODEL_VERSION, JevClient  # noqa: E402
from app.qualification.qualifier import qualify  # noqa: E402
from app.qualification.questions import (  # noqa: E402
    CHOICE_QUESTION,
    CURRENT_QUESTION_SET_VERSION,
    DOMAIN_CHOICES,
    NOUL_QUESTIONS,
    SCORE_QUESTIONS,
)
from app.qualification.schemas import (  # noqa: E402
    DomainClassification,
    JevAssessmentOutput,
    JevQuestionResults,
    RoutingDecision,
    validate_assessment_output,
)
from app.qualification.thresholds import (  # noqa: E402
    CURRENT_THRESHOLD_VERSION,
    DEFAULT_THRESHOLDS,
    ThresholdConfig,
    compute_routing,
)

# ── Fixtures ──────────────────────────────────────────────────────────────────

EXTRACTION_ID = str(uuid4())
SOURCE_ID = str(uuid4())

SAMPLE_EXTRACTION_ROW: dict = {
    "extraction_id": EXTRACTION_ID,
    "source_id": SOURCE_ID,
    "status": "VALIDATED",
    "validated_output": {
        "schema_version": "pdqe-extraction-v1",
        "title": "Pacific Fisheries Annual Report 2024",
        "publisher_name": "Secretariat of the Pacific Community",
        "source_type": "PDF_DOCUMENT",
        "candidate_domains": ["FISHERIES", "OCEAN"],
        "geographic_scope": ["Pacific Ocean", "Fiji", "Tonga"],
        "published_at": "2024-03-01",
        "date_confidence": 0.95,
        "licence_text": "CC BY 4.0",
        "licence_url": "https://creativecommons.org/licenses/by/4.0/",
        "licence_confidence": 0.9,
        "methodology": "Stock assessment via VPA model with observer-reported catch data.",
        "variables": [{"name": "annual_catch_tonnes", "unit": "tonnes", "description": None, "provenance": None}],
        "tables": [{"table_ref": "Table 3", "description": "Catch by species", "columns": ["species", "tonnes"], "row_count_estimate": 12}],
        "provenance": {},
        "contributing_sources": [],
        "confidence": 0.92,
        "extraction_notes": None,
    },
}


def _make_results(**overrides) -> JevQuestionResults:
    """Build a JevQuestionResults with sensible auto-approve-eligible defaults."""
    defaults = dict(
        source_identifiable=0.9,
        publisher_identifiable=0.9,
        methodology_present=0.9,
        licence_statement_present=0.9,
        geography_identifiable=0.9,
        time_period_identifiable=0.9,
        machine_readable=0.8,
        value_plausible=0.9,
        metadata_completeness=3,
        provenance_completeness=3,
        documentation_readiness=3,
        endpoint_readiness=3,
        completeness_score=3,
        domain_classification=DomainClassification.FISHERIES,
        classification_confidence=0.9,
    )
    defaults.update(overrides)
    return JevQuestionResults(**defaults)


def _mocked_qualify_patches():
    """Context managers patching qualifier.db fetch/write for an isolated qualify() run."""
    return (
        patch.object(qualifier.db, "fetch_validated_extraction", return_value=SAMPLE_EXTRACTION_ROW),
        patch.object(qualifier.db, "write_assessment", return_value={"id": str(uuid4())}),
    )


# ── Group 1 — Noul question results ──────────────────────────────────────────

def test_noul_returns_float_in_range():
    client = JevClient(mock_mode=True)
    value = asyncio.run(client.noul("source_identifiable", "Is the source identifiable?", "Title: X"))
    assert isinstance(value, float)
    assert 0.0 <= value <= 1.0


def test_noul_above_threshold_passes():
    client = JevClient(mock_mode=True)
    value = asyncio.run(client.noul("licence_statement_present", "Is a licence present?", "Licence: CC BY 4.0"))
    # Mock formula guarantees values in [0.70, 0.95] — always clears the
    # licence_clear_min=0.70 routing gate.
    assert value >= DEFAULT_THRESHOLDS.licence_clear_min


def test_noul_out_of_range_raises():
    client = JevClient(mock_mode=True)
    client.mock_mode = False

    async def bad_real_noul(question_text: str, context: str) -> float:
        return 1.5

    client._real_noul = bad_real_noul  # type: ignore[method-assign]
    with pytest.raises(ValueError):
        asyncio.run(client.noul("source_identifiable", "text", "context"))


def test_noul_negative_raises():
    client = JevClient(mock_mode=True)
    client.mock_mode = False

    async def bad_real_noul(question_text: str, context: str) -> float:
        return -0.2

    client._real_noul = bad_real_noul  # type: ignore[method-assign]
    with pytest.raises(ValueError):
        asyncio.run(client.noul("source_identifiable", "text", "context"))


def test_all_noul_questions_dispatched():
    client = JevClient(mock_mode=True)
    noul_map, _, _ = asyncio.run(qualifier._run_all_questions(client, "Title: Sample Document"))
    assert set(noul_map.keys()) == {q.id for q in NOUL_QUESTIONS}
    assert len(noul_map) == 8


def test_noul_deterministic_mock():
    client = JevClient(mock_mode=True)
    v1 = asyncio.run(client.noul("source_identifiable", "text", "same context"))
    v2 = asyncio.run(client.noul("source_identifiable", "text", "same context"))
    assert v1 == v2


def test_noul_different_contexts_different_results():
    client = JevClient(mock_mode=True)
    v1 = asyncio.run(client.noul("source_identifiable", "text", "Context A — Pacific Fisheries Report"))
    v2 = asyncio.run(client.noul("source_identifiable", "text", "Context B — Something Entirely Different"))
    assert v1 != v2


# ── Group 2 — Score question results ─────────────────────────────────────────

def test_score_returns_int_in_range():
    client = JevClient(mock_mode=True)
    value = asyncio.run(client.score("metadata_completeness", "Rate completeness", 4, "Title: X"))
    assert isinstance(value, int)
    assert 0 <= value <= 4


def test_score_out_of_range_raises():
    client = JevClient(mock_mode=True)
    client.mock_mode = False

    async def bad_real_score(question_text: str, max_score: int, context: str) -> int:
        return 10

    client._real_score = bad_real_score  # type: ignore[method-assign]
    with pytest.raises(ValueError):
        asyncio.run(client.score("metadata_completeness", "text", 4, "context"))


def test_score_negative_raises():
    client = JevClient(mock_mode=True)
    client.mock_mode = False

    async def bad_real_score(question_text: str, max_score: int, context: str) -> int:
        return -1

    client._real_score = bad_real_score  # type: ignore[method-assign]
    with pytest.raises(ValueError):
        asyncio.run(client.score("metadata_completeness", "text", 4, "context"))


def test_all_score_questions_dispatched():
    client = JevClient(mock_mode=True)
    _, score_map, _ = asyncio.run(qualifier._run_all_questions(client, "Title: Sample Document"))
    assert set(score_map.keys()) == {q.id for q in SCORE_QUESTIONS}
    assert len(score_map) == 4


def test_score_completeness_derived_correctly():
    fetch_patch, write_patch = _mocked_qualify_patches()
    with fetch_patch, write_patch:
        result = asyncio.run(qualify(UUID(EXTRACTION_ID), jev_client=JevClient(mock_mode=True)))
    assert result.question_results.completeness_score == result.question_results.metadata_completeness


# ── Group 3 — Choice question results ────────────────────────────────────────

def test_choice_returns_valid_domain():
    client = JevClient(mock_mode=True)
    value, confidence = asyncio.run(
        client.choice(CHOICE_QUESTION.id, CHOICE_QUESTION.text, CHOICE_QUESTION.choices, "Title: Fisheries Report")
    )
    assert value in DOMAIN_CHOICES
    assert DomainClassification(value) in DomainClassification


def test_choice_invalid_value_raises():
    client = JevClient(mock_mode=True)
    client.mock_mode = False

    async def bad_real_choice(question_text: str, choices: list[str], context: str) -> tuple[str, float]:
        return "NOT_A_REAL_DOMAIN", 0.9

    client._real_choice = bad_real_choice  # type: ignore[method-assign]
    with pytest.raises(ValueError):
        asyncio.run(client.choice(CHOICE_QUESTION.id, "text", DOMAIN_CHOICES, "context"))


def test_choice_confidence_in_range():
    client = JevClient(mock_mode=True)
    _, confidence = asyncio.run(
        client.choice(CHOICE_QUESTION.id, CHOICE_QUESTION.text, CHOICE_QUESTION.choices, "Title: X")
    )
    assert 0.0 <= confidence <= 1.0


def test_choice_none_of_above_valid():
    assert "NONE_OF_THE_ABOVE" in DOMAIN_CHOICES
    results = _make_results(domain_classification=DomainClassification.NONE_OF_THE_ABOVE)
    assert results.domain_classification == DomainClassification.NONE_OF_THE_ABOVE


# ── Group 4 — Threshold routing ───────────────────────────────────────────────

def test_auto_approve_when_completeness_ge2_and_value_plausible_ge085():
    results = _make_results(metadata_completeness=2, value_plausible=0.85, licence_statement_present=0.9)
    decision, rationale = compute_routing(results)
    assert decision == RoutingDecision.AUTO_APPROVE
    assert rationale


def test_human_review_when_completeness_lt2():
    results = _make_results(
        metadata_completeness=1, value_plausible=0.9, licence_statement_present=0.9, completeness_score=1
    )
    decision, _ = compute_routing(results)
    assert decision == RoutingDecision.HUMAN_REVIEW


def test_human_review_when_value_plausible_lt085():
    results = _make_results(metadata_completeness=3, value_plausible=0.5, licence_statement_present=0.9)
    decision, _ = compute_routing(results)
    assert decision == RoutingDecision.HUMAN_REVIEW


def test_reject_when_completeness_score_eq0():
    results = _make_results(completeness_score=0)
    decision, rationale = compute_routing(results)
    assert decision == RoutingDecision.REJECT
    assert "Completeness score 0" in rationale


def test_licence_check_required_when_licence_below_threshold():
    results = _make_results(
        metadata_completeness=3, value_plausible=0.9, licence_statement_present=0.5, completeness_score=3
    )
    decision, _ = compute_routing(results)
    assert decision == RoutingDecision.LICENCE_CHECK_REQUIRED


def test_reject_takes_priority_over_licence_check():
    results = _make_results(completeness_score=0, licence_statement_present=0.1)
    decision, _ = compute_routing(results)
    assert decision == RoutingDecision.REJECT


def test_licence_check_takes_priority_over_auto_approve():
    results = _make_results(
        metadata_completeness=4, value_plausible=0.99, licence_statement_present=0.2, completeness_score=4
    )
    decision, _ = compute_routing(results)
    assert decision == RoutingDecision.LICENCE_CHECK_REQUIRED


def test_auto_approve_boundary_exact_threshold_values():
    results = _make_results(
        metadata_completeness=DEFAULT_THRESHOLDS.auto_approve_completeness_min,
        value_plausible=DEFAULT_THRESHOLDS.auto_approve_value_plausible_min,
        licence_statement_present=DEFAULT_THRESHOLDS.licence_clear_min,
        completeness_score=2,
    )
    decision, _ = compute_routing(results)
    assert decision == RoutingDecision.AUTO_APPROVE


# ── Group 5 — Full qualification run ─────────────────────────────────────────

def test_qualify_returns_jev_assessment_output():
    fetch_patch, write_patch = _mocked_qualify_patches()
    with fetch_patch, write_patch:
        result = asyncio.run(qualify(UUID(EXTRACTION_ID), jev_client=JevClient(mock_mode=True)))
    assert isinstance(result, JevAssessmentOutput)
    assert str(result.extraction_id) == EXTRACTION_ID
    assert str(result.source_id) == SOURCE_ID


def test_qualify_writes_to_db_on_success():
    fetch_patch, write_patch = _mocked_qualify_patches()
    with fetch_patch, write_patch as mock_write:
        asyncio.run(qualify(UUID(EXTRACTION_ID), jev_client=JevClient(mock_mode=True)))
    mock_write.assert_called_once()


def test_qualify_advances_state_machine():
    """
    write_assessment() is where the two Stage 04 transition RPCs are issued
    (EXTRACTED -> CLASSIFIED -> QUALIFIED). Exercised directly here against a
    fully mocked Supabase client — no live DB connection.
    """
    mock_table = MagicMock()
    mock_table.insert.return_value.execute.return_value = MagicMock(data=[{"id": str(uuid4())}])

    mock_schema = MagicMock()
    mock_schema.table.return_value = mock_table
    mock_schema.rpc.return_value.execute.return_value = MagicMock()

    mock_client = MagicMock()
    mock_client.schema.return_value = mock_schema

    results = _make_results()
    output = JevAssessmentOutput(
        extraction_id=UUID(EXTRACTION_ID),
        source_id=UUID(SOURCE_ID),
        question_set_version=CURRENT_QUESTION_SET_VERSION,
        threshold_config_version=CURRENT_THRESHOLD_VERSION,
        jev_model_version=CURRENT_JEV_MODEL_VERSION,
        mock_mode=True,
        question_results=results,
        routing_decision=RoutingDecision.AUTO_APPROVE,
        routing_rationale="test rationale",
        auto_approve=True,
        requires_human_review=False,
        requires_licence_check=False,
    )

    with patch.object(db, "_get_client", return_value=mock_client):
        db.write_assessment(output)

    rpc_names = [call.args[0] for call in mock_schema.rpc.call_args_list]
    assert rpc_names == ["transition_to_classified", "transition_to_qualified"]


def test_qualify_no_db_write_when_flag_false():
    fetch_patch, write_patch = _mocked_qualify_patches()
    with fetch_patch, write_patch as mock_write:
        asyncio.run(
            qualify(UUID(EXTRACTION_ID), jev_client=JevClient(mock_mode=True), write_to_db=False)
        )
    mock_write.assert_not_called()


def test_qualify_extraction_not_found_raises():
    missing_id = uuid4()
    with patch.object(
        qualifier.db,
        "fetch_validated_extraction",
        side_effect=ValueError(f"Extraction {missing_id} not found in pdqe.extractions"),
    ):
        with pytest.raises(ValueError):
            asyncio.run(qualify(missing_id, jev_client=JevClient(mock_mode=True)))


# ── Group 6 — P9 + version reproducibility ───────────────────────────────────

def test_p9_schema_extra_fields_rejected():
    valid = _make_results().model_dump()
    valid["unexpected_extra_field"] = "should not be allowed"
    with pytest.raises(ValidationError):
        JevQuestionResults(**valid)


def test_all_versions_recorded_in_output():
    fetch_patch, write_patch = _mocked_qualify_patches()
    with fetch_patch, write_patch:
        result = asyncio.run(qualify(UUID(EXTRACTION_ID), jev_client=JevClient(mock_mode=True)))
    assert result.question_set_version
    assert result.threshold_config_version
    assert result.jev_model_version


def test_mock_mode_flag_recorded():
    fetch_patch, write_patch = _mocked_qualify_patches()
    with fetch_patch, write_patch:
        result = asyncio.run(qualify(UUID(EXTRACTION_ID), jev_client=JevClient(mock_mode=True)))
    assert result.mock_mode is True


def test_version_pinned_in_assessment():
    fetch_patch, write_patch = _mocked_qualify_patches()
    with fetch_patch, write_patch:
        result = asyncio.run(qualify(UUID(EXTRACTION_ID), jev_client=JevClient(mock_mode=True)))
    assert result.question_set_version == CURRENT_QUESTION_SET_VERSION
    assert result.threshold_config_version == CURRENT_THRESHOLD_VERSION


def test_routing_rationale_non_empty():
    for results in (
        _make_results(completeness_score=0),
        _make_results(licence_statement_present=0.1),
        _make_results(metadata_completeness=1, completeness_score=1),
        _make_results(),
    ):
        _, rationale = compute_routing(results)
        assert len(rationale) > 0


def test_parallel_questions_all_resolved():
    client = JevClient(mock_mode=True)
    noul_map, score_map, (domain_value, domain_confidence) = asyncio.run(
        qualifier._run_all_questions(client, "Title: Sample Document for full resolution check")
    )
    assert all(v is not None for v in noul_map.values())
    assert len(noul_map) == 8
    assert all(v is not None for v in score_map.values())
    assert len(score_map) == 4
    assert domain_value is not None
    assert domain_confidence is not None


# ── Supplementary — validate_assessment_output() P9 gate ─────────────────────

def test_validate_assessment_output_accepts_well_formed_dict():
    results = _make_results()
    raw = {
        "extraction_id": EXTRACTION_ID,
        "source_id": SOURCE_ID,
        "question_set_version": CURRENT_QUESTION_SET_VERSION,
        "threshold_config_version": CURRENT_THRESHOLD_VERSION,
        "jev_model_version": CURRENT_JEV_MODEL_VERSION,
        "mock_mode": True,
        "question_results": results.model_dump(),
        "routing_decision": "AUTO_APPROVE",
        "routing_rationale": "ok",
        "auto_approve": True,
        "requires_human_review": False,
        "requires_licence_check": False,
    }
    output = validate_assessment_output(raw)
    assert output.routing_decision == RoutingDecision.AUTO_APPROVE
