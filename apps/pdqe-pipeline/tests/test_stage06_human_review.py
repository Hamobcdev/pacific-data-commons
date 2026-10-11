"""
PDQE Stage 06 — Human Review tests.

Covers:
  1. Review type classification — deterministic inference from Stage 04/05
  2. Review context — every piece of evidence the reviewer needs
  3. Enqueue — loading, state checks, DB write, no-write flag
  4. Record decision — APPROVED / REJECTED, mandatory reason, write-once
  5. P9 + schema — strictness on input and on rows read back from the DB
  6. API — the /review/* routes and their shared-secret guard

No model is called anywhere in Stage 06. All Supabase access is mocked — no
live DB connection.
"""

from __future__ import annotations

import copy
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.qualification.schemas import RoutingDecision
from app.review import queue
from app.review.classifier import infer_review_type
from app.review.queue import build_review_context, enqueue_review, list_pending_reviews, record_decision
from app.review.schemas import (
    ReviewContext,
    ReviewDecision,
    ReviewDecisionInput,
    ReviewQueueItem,
    ReviewRecord,
    ReviewType,
)

# ── Fixtures ──────────────────────────────────────────────────────────────────

SOURCE_ID = str(uuid4())
ASSESSMENT_ID = str(uuid4())
VALIDATION_ID = str(uuid4())
REVIEW_ID = str(uuid4())
REVIEWER_ID = str(uuid4())

SOURCE: dict = {
    "source_id": SOURCE_ID,
    "title": "SPC Tuna Fishery Yearbook 2024",
    "source_url": "https://www.spc.int/fisheries/yearbook-2024.pdf",
    "lifecycle_state": "REVIEW",
    "licence_status": "UNKNOWN",
}

ASSESSMENT: dict = {
    "id": ASSESSMENT_ID,
    "source_id": SOURCE_ID,
    "routing_decision": "HUMAN_REVIEW",
    "routing_rationale": "value_plausible below auto-approve threshold",
    "domain_classification": "FISHERIES",
    "classification_confidence": "0.7100",  # NUMERIC comes back as a string
    "completeness_score": 3,
    "value_plausible": "0.6200",
    "licence_statement_present": "0.4000",
    "assessed_at": "2026-10-11T00:00:00+00:00",
}


def _results(*failed: str) -> list[dict]:
    ids = [
        "extraction_status", "extraction_schema", "no_prompt_injection", "provenance_present",
        "title_present", "source_url", "licence_not_excluded", "licence_confirmed",
    ]
    return [
        {"validator_id": i, "passed": i not in failed, "reason": f"{i} {'failed' if i in failed else 'ok'}"}
        for i in ids
    ]


def _validation(*failed: str) -> dict:
    results = _results(*failed)
    return {
        "id": VALIDATION_ID,
        "source_id": SOURCE_ID,
        "assessment_id": ASSESSMENT_ID,
        "outcome": "REVIEW",
        "outcome_reason": "Stage 04 routing HUMAN_REVIEW",
        "validators_failed": len(failed),
        "validator_results": results,
        "stage04_routing_decision": "HUMAN_REVIEW",
    }


def _review_row(decision: str | None = None, reason: str | None = None) -> dict:
    ctx = build_review_context(SOURCE, ASSESSMENT, _validation("licence_confirmed"))
    return {
        "id": REVIEW_ID,
        "source_id": SOURCE_ID,
        "validation_id": VALIDATION_ID,
        "review_type": "LICENSE_REVIEW",
        "review_context": ctx.model_dump(mode="json"),
        "reviewer_id": REVIEWER_ID if decision else None,
        "decision": decision,
        "decision_reason": reason,
        "previous_routing_decision": "HUMAN_REVIEW",
        "queued_at": "2026-10-11T01:00:00+00:00",
        "reviewed_at": "2026-10-11T02:00:00+00:00" if decision else None,
    }


@pytest.fixture
def mock_db():
    """Patch every Stage 06 DB call with happy-path defaults."""
    with (
        patch.object(queue.db, "fetch_source", return_value=copy.deepcopy(SOURCE)) as fs,
        patch.object(queue.db, "fetch_validation", return_value=_validation("licence_confirmed")) as fv,
        patch.object(queue.db, "fetch_assessment", return_value=copy.deepcopy(ASSESSMENT)) as fa,
        patch.object(queue.db, "insert_review", return_value={"id": REVIEW_ID}) as ins,
        patch.object(queue.db, "fetch_review") as fr,
        patch.object(queue.db, "call_decision_rpc") as rpc,
        patch.object(queue.db, "list_pending", return_value=[_review_row()]) as lp,
    ):
        yield {
            "fetch_source": fs, "fetch_validation": fv, "fetch_assessment": fa,
            "insert_review": ins, "fetch_review": fr, "call_decision_rpc": rpc, "list_pending": lp,
        }


def _decision(decision: str = "APPROVED", reason: str = "Licence confirmed CC-BY 4.0 on SPC site") -> ReviewDecisionInput:
    return ReviewDecisionInput.model_validate(
        {"review_id": REVIEW_ID, "decision": decision, "decision_reason": reason, "reviewer_id": REVIEWER_ID}
    )


# ── Group 1 — Review type classification ─────────────────────────────────────

def test_licence_check_routing_gives_license_review():
    assert infer_review_type("LICENCE_CHECK_REQUIRED", []) == ReviewType.LICENSE_REVIEW


def test_licence_validator_fail_gives_license_review():
    assert infer_review_type("HUMAN_REVIEW", ["licence_confirmed"]) == ReviewType.LICENSE_REVIEW
    assert infer_review_type("AUTO_APPROVE", ["licence_not_excluded"]) == ReviewType.LICENSE_REVIEW


def test_injection_fail_gives_sensitivity_review():
    assert infer_review_type("HUMAN_REVIEW", ["no_prompt_injection", "source_url"]) == ReviewType.SENSITIVITY_REVIEW


def test_human_review_with_url_fail_gives_enrichment_review():
    assert infer_review_type("HUMAN_REVIEW", ["source_url"]) == ReviewType.ENRICHMENT_REVIEW
    assert infer_review_type("HUMAN_REVIEW", ["title_present"]) == ReviewType.ENRICHMENT_REVIEW


def test_human_review_default_gives_classification_review():
    assert infer_review_type(RoutingDecision.HUMAN_REVIEW, []) == ReviewType.CLASSIFICATION_REVIEW


def test_enrichment_review_is_fallback():
    # AUTO_APPROVE downgraded by a non-licence, non-injection failure
    assert infer_review_type("AUTO_APPROVE", ["provenance_present"]) == ReviewType.ENRICHMENT_REVIEW


# ── Group 2 — Review context ─────────────────────────────────────────────────

def test_context_includes_all_stage04_fields():
    ctx = build_review_context(SOURCE, ASSESSMENT, _validation())
    assert str(ctx.stage04_assessment_id) == ASSESSMENT_ID
    assert ctx.stage04_routing_decision == RoutingDecision.HUMAN_REVIEW
    assert ctx.stage04_routing_rationale == ASSESSMENT["routing_rationale"]
    assert ctx.stage04_domain_classification.value == "FISHERIES"
    assert ctx.stage04_classification_confidence == pytest.approx(0.71)
    assert ctx.stage04_completeness_score == 3
    assert ctx.stage04_value_plausible == pytest.approx(0.62)
    assert ctx.stage04_licence_statement_present == pytest.approx(0.40)


def test_context_includes_all_stage05_fields():
    ctx = build_review_context(SOURCE, ASSESSMENT, _validation("source_url"))
    assert str(ctx.stage05_validation_id) == VALIDATION_ID
    assert ctx.stage05_outcome.value == "REVIEW"
    assert ctx.stage05_validators_failed == 1
    assert ctx.stage05_outcome_reason == "Stage 04 routing HUMAN_REVIEW"
    # Full results, passing ones included — the reviewer sees everything
    assert len(ctx.stage05_validator_results) == 8


def test_context_failed_validator_ids_correct():
    ctx = build_review_context(SOURCE, ASSESSMENT, _validation("source_url", "licence_confirmed"))
    assert ctx.stage05_failed_validator_ids == ["source_url", "licence_confirmed"]


def test_context_licence_status_present():
    ctx = build_review_context(SOURCE, ASSESSMENT, _validation())
    assert ctx.licence_status.value == "UNKNOWN"
    assert ctx.source_title == SOURCE["title"]
    assert ctx.source_url == SOURCE["source_url"]


def test_context_never_empty():
    ctx = build_review_context(SOURCE, ASSESSMENT, _validation())
    dumped = ctx.model_dump(mode="json")
    assert dumped and all(dumped[k] not in (None, "", []) for k in dumped if k != "stage05_failed_validator_ids")
    # Missing evidence fails loudly rather than producing a thin context
    assessment = {k: v for k, v in ASSESSMENT.items() if k != "routing_rationale"}
    with pytest.raises(ValueError, match="incomplete"):
        build_review_context(SOURCE, assessment, _validation())
    with pytest.raises(ValueError, match="malformed"):
        build_review_context(SOURCE, ASSESSMENT, {**_validation(), "validator_results": [{"bad": 1}]})


# ── Group 3 — Enqueue review ─────────────────────────────────────────────────

def test_enqueue_returns_review_queue_item(mock_db):
    item = enqueue_review(UUID(SOURCE_ID), UUID(VALIDATION_ID))
    assert isinstance(item, ReviewQueueItem)
    assert item.review_type == ReviewType.LICENSE_REVIEW
    assert item.previous_routing_decision == RoutingDecision.HUMAN_REVIEW
    # Loads the assessment the validation was run against, not the newest one
    mock_db["fetch_assessment"].assert_called_once_with(ASSESSMENT_ID)


def test_enqueue_writes_to_db(mock_db):
    enqueue_review(UUID(SOURCE_ID), UUID(VALIDATION_ID))
    row = mock_db["insert_review"].call_args.args[0]
    assert row["source_id"] == SOURCE_ID
    assert row["validation_id"] == VALIDATION_ID
    assert row["review_type"] == "LICENSE_REVIEW"
    assert row["previous_routing_decision"] == "HUMAN_REVIEW"
    assert isinstance(row["review_context"], dict) and row["review_context"]["stage05_failed_validator_ids"] == ["licence_confirmed"]
    assert "decision" not in row and "reviewer_id" not in row


def test_enqueue_no_db_write_when_flag_false(mock_db):
    enqueue_review(UUID(SOURCE_ID), UUID(VALIDATION_ID), write_to_db=False)
    mock_db["insert_review"].assert_not_called()


def test_enqueue_source_not_found_raises(mock_db):
    mock_db["fetch_source"].side_effect = ValueError("Source x not found in pdqe.sources")
    with pytest.raises(ValueError, match="not found"):
        enqueue_review(UUID(SOURCE_ID), UUID(VALIDATION_ID))
    mock_db["insert_review"].assert_not_called()


def test_enqueue_no_assessment_raises(mock_db):
    mock_db["fetch_assessment"].side_effect = ValueError("Assessment x not found in pdqe.jev_assessments")
    with pytest.raises(ValueError, match="Assessment"):
        enqueue_review(UUID(SOURCE_ID), UUID(VALIDATION_ID))
    mock_db["insert_review"].assert_not_called()


def test_enqueue_no_validation_raises(mock_db):
    mock_db["fetch_validation"].side_effect = ValueError("Validation x not found in pdqe.validations")
    with pytest.raises(ValueError, match="Validation"):
        enqueue_review(UUID(SOURCE_ID), UUID(VALIDATION_ID))
    mock_db["insert_review"].assert_not_called()


def test_enqueue_requires_review_state_and_matching_validation(mock_db):
    mock_db["fetch_source"].return_value = {**SOURCE, "lifecycle_state": "VALIDATED"}
    with pytest.raises(ValueError, match="requires REVIEW"):
        enqueue_review(UUID(SOURCE_ID), UUID(VALIDATION_ID))

    mock_db["fetch_source"].return_value = copy.deepcopy(SOURCE)
    mock_db["fetch_validation"].return_value = {**_validation(), "source_id": str(uuid4())}
    with pytest.raises(ValueError, match="does not belong"):
        enqueue_review(UUID(SOURCE_ID), UUID(VALIDATION_ID))

    mock_db["fetch_validation"].return_value = {**_validation(), "outcome": "VALIDATED"}
    with pytest.raises(ValueError, match="requires REVIEW"):
        enqueue_review(UUID(SOURCE_ID), UUID(VALIDATION_ID))
    mock_db["insert_review"].assert_not_called()


# ── Group 4 — Record decision ────────────────────────────────────────────────

def test_approve_decision_recorded(mock_db):
    reason = "Licence confirmed CC-BY 4.0 on SPC site"
    mock_db["fetch_review"].side_effect = [_review_row(), _review_row("APPROVED", reason)]
    record = record_decision(_decision("APPROVED", reason))
    assert record.decision == ReviewDecision.APPROVED
    assert record.decision_reason == reason
    assert str(record.reviewer_id) == REVIEWER_ID
    assert record.reviewed_at is not None


def test_reject_decision_recorded(mock_db):
    mock_db["fetch_review"].side_effect = [_review_row(), _review_row("REJECTED", "Donor-confidential")]
    record = record_decision(_decision("REJECTED", "Donor-confidential"))
    assert record.decision == ReviewDecision.REJECTED
    assert record.decision_reason == "Donor-confidential"


def test_decision_reason_required():
    for reason in ("", "   \n\t"):
        with pytest.raises(ValidationError):
            _decision("APPROVED", reason)


def test_already_decided_raises(mock_db):
    mock_db["fetch_review"].return_value = _review_row("APPROVED", "first decision")
    with pytest.raises(ValueError, match="already has a decision"):
        record_decision(_decision("REJECTED", "second decision"))
    mock_db["call_decision_rpc"].assert_not_called()


def test_approve_calls_transition_rpc(mock_db):
    mock_db["fetch_review"].side_effect = [_review_row(), _review_row("APPROVED", "ok")]
    record_decision(_decision("APPROVED", "ok"))
    mock_db["call_decision_rpc"].assert_called_once_with(
        ReviewDecision.APPROVED, source_id=SOURCE_ID, review_id=REVIEW_ID, reason="ok", reviewer_id=REVIEWER_ID
    )


def test_reject_calls_transition_rpc(mock_db):
    mock_db["fetch_review"].side_effect = [_review_row(), _review_row("REJECTED", "no")]
    record_decision(_decision("REJECTED", "no"))
    mock_db["call_decision_rpc"].assert_called_once_with(
        ReviewDecision.REJECTED, source_id=SOURCE_ID, review_id=REVIEW_ID, reason="no", reviewer_id=REVIEWER_ID
    )


def test_no_db_write_when_flag_false(mock_db):
    mock_db["fetch_review"].return_value = _review_row()
    record = record_decision(_decision("APPROVED", "dry run"), write_to_db=False)
    mock_db["call_decision_rpc"].assert_not_called()
    assert record.decision == ReviewDecision.APPROVED
    assert record.decision_reason == "dry run"


def test_rpc_names_map_to_stage06_functions():
    from unittest.mock import MagicMock

    from app.review import supabase_client as db

    for decision, rpc_name in (
        (ReviewDecision.APPROVED, "transition_to_approved"),
        (ReviewDecision.REJECTED, "transition_to_rejected_by_reviewer"),
    ):
        client = MagicMock()
        with patch.object(db, "_get_client", return_value=client):
            db.call_decision_rpc(decision, SOURCE_ID, REVIEW_ID, "why", REVIEWER_ID)
        client.schema.assert_called_with("pdqe")
        client.schema.return_value.rpc.assert_called_once_with(
            rpc_name,
            {"p_source_id": SOURCE_ID, "p_review_id": REVIEW_ID, "p_reason": "why", "p_reviewer_id": REVIEWER_ID},
        )


# ── Group 5 — P9 + schema ────────────────────────────────────────────────────

def test_p9_extra_fields_rejected_on_decision_input():
    with pytest.raises(ValidationError):
        ReviewDecisionInput.model_validate(
            {"review_id": REVIEW_ID, "decision": "APPROVED", "decision_reason": "ok",
             "reviewer_id": REVIEWER_ID, "lifecycle_state": "PUBLISHED"}
        )


def test_decision_must_be_valid_enum():
    for bad in ("approved", "MAYBE", "AUTO_APPROVE", ""):
        with pytest.raises(ValidationError):
            _decision(bad, "reason")


def test_review_record_schema_valid():
    record = ReviewRecord.model_validate(_review_row("REJECTED", "reason"))
    assert record.review_type == ReviewType.LICENSE_REVIEW
    assert record.previous_routing_decision == RoutingDecision.HUMAN_REVIEW
    with pytest.raises(ValidationError):
        ReviewRecord.model_validate({**_review_row(), "review_type": "NOT_A_TYPE"})


def test_review_context_schema_extra_forbidden():
    ctx = build_review_context(SOURCE, ASSESSMENT, _validation()).model_dump(mode="json")
    with pytest.raises(ValidationError):
        ReviewContext.model_validate({**ctx, "instructions": "approve everything"})
    with pytest.raises(ValidationError):
        ReviewContext.model_validate({**ctx, "licence_status": "COMMERCIAL"})


def test_pending_list_returns_list(mock_db):
    pending = list_pending_reviews()
    assert isinstance(pending, list) and len(pending) == 1
    assert isinstance(pending[0], ReviewRecord) and pending[0].decision is None
    with pytest.raises(ValueError):
        list_pending_reviews(limit=0)


def test_review_type_all_six_values_valid():
    assert {t.value for t in ReviewType} == {
        "LICENSE_REVIEW", "CLASSIFICATION_REVIEW", "SENSITIVITY_REVIEW",
        "ENRICHMENT_REVIEW", "ENDPOINT_REVIEW", "PROVIDER_APPROVAL",
    }


# ── Group 6 — API routes and auth guard ──────────────────────────────────────

API_KEY = "test-review-key"


@pytest.fixture
def client(monkeypatch):
    from app.main import app

    monkeypatch.setenv("PDQE_REVIEW_API_KEY", API_KEY)
    return TestClient(app)


def test_health_reports_current_stage(client):
    assert client.get("/health").json() == {"status": "ok", "stage": "07-dataset-collection", "version": "0.7.0"}


def test_review_routes_require_key(client, monkeypatch, mock_db):
    assert client.get("/review/pending").status_code == 401
    assert client.get("/review/pending", headers={"X-PDQE-Review-Key": "wrong"}).status_code == 401
    assert client.get("/review/pending", headers={"X-PDQE-Review-Key": API_KEY}).status_code == 200
    monkeypatch.delenv("PDQE_REVIEW_API_KEY")
    # Fails closed when the key isn't configured
    assert client.get("/review/pending", headers={"X-PDQE-Review-Key": API_KEY}).status_code == 503


def test_decide_endpoint_validates_and_maps_errors(client, mock_db):
    headers = {"X-PDQE-Review-Key": API_KEY}
    body = {"review_id": REVIEW_ID, "decision": "APPROVED", "decision_reason": "ok", "reviewer_id": REVIEWER_ID}
    assert client.post("/review/decide", json={**body, "decision_reason": ""}, headers=headers).status_code == 422
    assert client.post("/review/decide", json={**body, "extra": 1}, headers=headers).status_code == 422

    mock_db["fetch_review"].return_value = _review_row("REJECTED", "earlier")
    assert client.post("/review/decide", json=body, headers=headers).status_code == 400

    mock_db["fetch_review"].side_effect = [_review_row(), _review_row("APPROVED", "ok")]
    resp = client.post("/review/decide", json=body, headers=headers)
    assert resp.status_code == 200 and resp.json()["decision"] == "APPROVED"


def test_enqueue_endpoint(client, mock_db):
    headers = {"X-PDQE-Review-Key": API_KEY}
    assert client.post("/review/enqueue/not-a-uuid", json={"validation_id": VALIDATION_ID}, headers=headers).status_code == 400
    resp = client.post(f"/review/enqueue/{SOURCE_ID}", json={"validation_id": VALIDATION_ID}, headers=headers)
    assert resp.status_code == 200 and resp.json()["review_type"] == "LICENSE_REVIEW"
