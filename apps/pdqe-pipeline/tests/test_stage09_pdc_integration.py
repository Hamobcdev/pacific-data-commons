"""
PDQE Stage 09 — PDC Integration tests.

Covers:
  1. Endpoint validation checks
  2. Validation pipeline and state transition
  3. Provider approval
  4. Publication
  5. x402 registration
  6. Full pipeline and HEALTH domain

All Supabase access is replaced by an in-memory fake that mimics the Stage 09
transition RPCs; no live DB connection and no network call is made.
"""

from __future__ import annotations

import copy
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.dataset.schemas import DatasetRecord
from app.endpoint.generator import build_spec, compute_endpoint_hash
from app.endpoint.schemas import EndpointRecord
from app.integration import supabase_client as db
from app.integration import x402_client
from app.integration.approver import publish_endpoint, submit_provider_approval
from app.integration.pipeline import (
    run_endpoint_validation,
    run_full_pipeline,
    run_x402_registration,
)
from app.integration.schemas import ProviderApprovalInput, X402RegistrationResult
from app.integration.validator import VALIDATION_CHECKS, run_checks, validate_endpoint
from app.main import app

# ── Fixtures ──────────────────────────────────────────────────────────────────

SOURCE_ID = uuid4()
DATASET_ID = uuid4()
COLLECTION_ID = uuid4()
ENDPOINT_ID = uuid4()
NOW = datetime(2026, 10, 12, tzinfo=timezone.utc).isoformat()
WALLET = "A" * 58
API_KEY = "test-review-key"


def _dataset(domain: str = "FISHERIES", metadata: dict | None = None) -> DatasetRecord:
    return DatasetRecord.model_validate(
        {
            "dataset_id": str(DATASET_ID),
            "source_ids": [str(SOURCE_ID)],
            "primary_source_id": str(SOURCE_ID),
            "extraction_ids": [str(uuid4())],
            "domain": domain,
            "title": "Samoa Tuna Catch" if domain == "FISHERIES" else "Samoa Immunisation Coverage",
            "description": "Annual indicator series for Samoa.",
            "geography_scope": ["Samoa"],
            "time_period_start": "2015",
            "time_period_end": "2024",
            "licence_status": "CLEAR",
            "licence_url": "https://creativecommons.org/licenses/by/4.0/",
            "version": 1,
            "dataset_hash": "b" * 64,
            "metadata": metadata or {},
            "lifecycle_state": "COLLECTION_LINKED",
            "created_at": NOW,
            "updated_at": NOW,
        }
    )


def _row(domain: str = "FISHERIES", metadata: dict | None = None) -> dict:
    """A DRAFT pdqe.endpoints row exactly as Stage 08 would store it."""
    spec = build_spec(
        _dataset(domain, metadata),
        {"completeness_score": 2},
        {"source_type": "API_ENDPOINT"},
        COLLECTION_ID,
    )
    row = spec.model_dump(mode="json")
    row["price_usdc"] = f"{spec.price_usdc:.4f}"
    row.update(
        endpoint_id=str(ENDPOINT_ID),
        provider_wallet=None,
        status="DRAFT",
        generated_at=NOW,
        updated_at=NOW,
        provider_approved_at=None,
        x402_registration_id=None,
        x402_registered_at=None,
    )
    return row


def _rehash(row: dict) -> dict:
    row["endpoint_hash"] = compute_endpoint_hash(EndpointRecord.model_validate(row))
    return row


class FakeDB:
    """In-memory pdqe.endpoints + pdqe.sources that mimics the Stage 09 RPCs."""

    def __init__(self, row: dict, source_state: str = "ENDPOINT_GENERATED"):
        self.row = row
        self.source_state = source_state
        self.calls: list[str] = []

    def fetch_endpoint(self, endpoint_id: str) -> dict:
        return copy.deepcopy(self.row)

    def fetch_source(self, source_id: str) -> dict:
        return {"source_id": source_id, "lifecycle_state": self.source_state}

    def _expect(self, name: str, state: str) -> None:
        self.calls.append(name)
        if self.source_state != state:
            raise ValueError(f"{name}: source in {self.source_state}")

    def call_endpoint_validated(self, source_id, endpoint_id):
        self._expect("endpoint_validated", "ENDPOINT_GENERATED")
        self.row["status"] = "VALIDATED"
        self.source_state = "ENDPOINT_VALIDATED"

    def call_provider_approved(self, source_id, endpoint_id, wallet, price, endpoint_hash):
        self._expect("provider_approved", "ENDPOINT_VALIDATED")
        self.row.update(
            provider_wallet=wallet,
            price_usdc=f"{price:.4f}",
            endpoint_hash=endpoint_hash,
            provider_approved_at=NOW,
        )
        self.source_state = "PROVIDER_APPROVED"

    def call_published(self, source_id, endpoint_id):
        self._expect("published", "PROVIDER_APPROVED")
        self.row["status"] = "PUBLISHED"
        self.source_state = "PUBLISHED"

    def call_x402_queryable(self, source_id, endpoint_id, registration_id):
        self._expect("x402_queryable", "PUBLISHED")
        self.row.update(x402_registration_id=registration_id, x402_registered_at=NOW)
        self.source_state = "x402_QUERYABLE"


@pytest.fixture
def fake_db_factory():
    patchers = []

    def make(row: dict, source_state: str = "ENDPOINT_GENERATED") -> FakeDB:
        fake = FakeDB(row, source_state)
        for name in (
            "fetch_endpoint", "fetch_source", "call_endpoint_validated",
            "call_provider_approved", "call_published", "call_x402_queryable",
        ):
            p = patch.object(db, name, side_effect=getattr(fake, name))
            p.start()
            patchers.append(p)
        return fake

    yield make
    for p in patchers:
        p.stop()


@pytest.fixture
def fake_db(fake_db_factory) -> FakeDB:
    return fake_db_factory(_row())


@pytest.fixture(autouse=True)
def _mock_mode(monkeypatch):
    monkeypatch.delenv("VITE_FLAG_LIVE_RPC_ACTIVE", raising=False)


def _validated_state(fake: FakeDB) -> FakeDB:
    fake.row["status"] = "VALIDATED"
    fake.source_state = "ENDPOINT_VALIDATED"
    return fake


def _approved_state(fake: FakeDB) -> FakeDB:
    _validated_state(fake)
    fake.row.update(provider_wallet=WALLET, provider_approved_at=NOW)
    fake.source_state = "PROVIDER_APPROVED"
    return fake


def _published_state(fake: FakeDB) -> FakeDB:
    _approved_state(fake)
    fake.row["status"] = "PUBLISHED"
    fake.source_state = "PUBLISHED"
    return fake


def _failed(row: dict) -> set[str]:
    return {c.check_id for c in run_checks(row) if not c.passed}


# ── Group 1 — Endpoint validation checks ──────────────────────────────────────

def test_validate_passes_clean_endpoint(fake_db):
    output = validate_endpoint(ENDPOINT_ID)
    assert output.passed is True
    assert all(c.passed for c in output.checks)
    assert output.endpoint_id == ENDPOINT_ID


def test_validate_fails_bad_path_format():
    row = _row()
    row["path"] = "/Pacific/fisheries/Samoa Tuna"
    assert "path_format" in _failed(row)
    row["path"] = "/api/fisheries/" + row["slug"]
    assert "path_format" in _failed(row)


def test_validate_fails_blank_title():
    row = _row()
    row["title"] = "   "
    assert "title_not_blank" in _failed(row)


def test_validate_fails_missing_description():
    row = _row()
    row["description"] = None
    assert "description_present" in _failed(row)
    row["description"] = "  "
    assert "description_present" in _failed(row)


def test_validate_fails_empty_parameters():
    # HEALTH requires year and country.
    row = _row("HEALTH")
    row["parameters"] = []
    failed = {c.check_id: c.message for c in run_checks(row) if not c.passed}
    assert "parameters_valid" in failed
    assert "year" in failed["parameters_valid"] and "country" in failed["parameters_valid"]


def test_validate_fails_bad_hash():
    row = _row()
    row["endpoint_hash"] = "XYZ"
    assert "hash_present" in _failed(row)
    # Well-formed but not matching the spec (spec tampered after generation).
    row = _row()
    row["title"] = "Tampered title"
    assert _failed(row) == {"hash_present"}


def test_validate_fails_empty_provenance():
    row = _row()
    row["provenance_source_ids"] = []
    assert "provenance_complete" in _failed(row)
    row = _row()
    row["provenance_dataset_id"] = None
    assert "provenance_complete" in _failed(row)


def test_validate_t5_without_sovereignty_fails():
    row = _row()
    row["pricing_tier"] = "T5"
    row["price_usdc"] = "5.0000"
    row["cultural_sovereignty"] = False
    assert "t5_sovereignty_check" in _failed(row)


def test_validate_price_below_tier_floor_fails():
    row = _row()
    row["pricing_tier"] = "T2"
    row["price_usdc"] = "0.0500"
    failed = _failed(row)
    assert "pricing_consistent" in failed
    assert "price_usdc_positive" not in failed


def test_validate_health_domain_accepted():
    row = _row("HEALTH")
    assert row["path"].startswith("/pacific/health/")
    results = {c.check_id: c for c in run_checks(row)}
    assert results["domain_supported"].passed
    assert all(c.passed for c in results.values())


# ── Group 2 — Validation pipeline and state transition ────────────────────────

def test_run_validation_transitions_on_pass(fake_db):
    output = run_endpoint_validation(ENDPOINT_ID, SOURCE_ID)
    assert output.passed
    assert fake_db.calls == ["endpoint_validated"]
    assert fake_db.row["status"] == "VALIDATED"
    assert fake_db.source_state == "ENDPOINT_VALIDATED"


def test_run_validation_no_transition_on_fail(fake_db_factory):
    row = _row()
    row["description"] = None
    fake = fake_db_factory(_rehash(row))
    output = run_endpoint_validation(ENDPOINT_ID, SOURCE_ID)
    assert output.passed is False
    assert fake.calls == []
    assert fake.row["status"] == "DRAFT"


def test_run_validation_collects_all_errors(fake_db_factory):
    row = _row()
    row.update(title=" ", description=None, endpoint_hash="bad", provenance_source_ids=[], price_usdc="0")
    fake_db_factory(row)
    output = run_endpoint_validation(ENDPOINT_ID, SOURCE_ID)
    failed = {c.check_id for c in output.checks if not c.passed}
    assert {
        "title_not_blank", "description_present", "hash_present",
        "provenance_complete", "pricing_consistent", "price_usdc_positive",
        "record_schema_valid",
    } <= failed


def test_validation_returns_all_check_ids(fake_db):
    output = validate_endpoint(ENDPOINT_ID)
    assert [c.check_id for c in output.checks] == VALIDATION_CHECKS
    assert {
        "path_format", "slug_format", "title_not_blank", "description_present",
        "parameters_valid", "response_schema_valid", "hash_present",
        "provenance_complete", "domain_supported", "pricing_consistent",
        "t5_sovereignty_check", "price_usdc_positive",
    } <= set(VALIDATION_CHECKS)


# ── Group 3 — Provider approval ────────────────────────────────────────────────

def test_provider_approval_sets_wallet(fake_db):
    _validated_state(fake_db)
    record = submit_provider_approval(ENDPOINT_ID, SOURCE_ID, ProviderApprovalInput(provider_wallet=WALLET))
    assert record.provider_wallet == WALLET
    assert record.provider_approved_at is not None
    assert record.price_usdc == Decimal("0.01")
    assert record.status.value == "VALIDATED"


def test_provider_approval_accepts_custom_price_above_floor(fake_db):
    _validated_state(fake_db)
    old_hash = fake_db.row["endpoint_hash"]
    record = submit_provider_approval(
        ENDPOINT_ID, SOURCE_ID, ProviderApprovalInput(provider_wallet=WALLET, price_usdc=Decimal("0.25"))
    )
    assert record.price_usdc == Decimal("0.25")
    # Price is part of the spec, so the hash is recomputed and still verifies.
    assert record.endpoint_hash != old_hash
    assert compute_endpoint_hash(record) == record.endpoint_hash


def test_provider_approval_rejects_price_below_floor(fake_db):
    _validated_state(fake_db)
    with pytest.raises(ValueError, match="below the T1 floor"):
        submit_provider_approval(
            ENDPOINT_ID, SOURCE_ID, ProviderApprovalInput(provider_wallet=WALLET, price_usdc=Decimal("0.005"))
        )
    assert fake_db.calls == []


def test_provider_approval_rejects_invalid_wallet(fake_db):
    for bad in ("a" * 58, "A" * 57, "A" * 57 + "1", "0x" + "A" * 56, ""):
        with pytest.raises(ValidationError):
            ProviderApprovalInput(provider_wallet=bad)
    _validated_state(fake_db)
    forged = ProviderApprovalInput.model_construct(provider_wallet="not-a-wallet", price_usdc=None)
    with pytest.raises(ValueError, match="invalid"):
        submit_provider_approval(ENDPOINT_ID, SOURCE_ID, forged)
    assert fake_db.calls == []


def test_provider_approval_requires_validated_status(fake_db):
    with pytest.raises(ValueError, match="requires VALIDATED"):
        submit_provider_approval(ENDPOINT_ID, SOURCE_ID, ProviderApprovalInput(provider_wallet=WALLET))
    assert fake_db.calls == []


def test_provider_approval_calls_transition_rpc(fake_db):
    _validated_state(fake_db)
    with patch.object(db, "call_provider_approved", side_effect=fake_db.call_provider_approved) as rpc:
        submit_provider_approval(ENDPOINT_ID, SOURCE_ID, ProviderApprovalInput(provider_wallet=WALLET))
    rpc.assert_called_once()
    source_id, endpoint_id, wallet, price, endpoint_hash = rpc.call_args.args
    assert (source_id, endpoint_id, wallet, price) == (str(SOURCE_ID), str(ENDPOINT_ID), WALLET, Decimal("0.01"))
    assert len(endpoint_hash) == 64
    assert fake_db.source_state == "PROVIDER_APPROVED"


def test_provider_approval_p9_rejects_extra_fields():
    with pytest.raises(ValidationError):
        ProviderApprovalInput(provider_wallet=WALLET, status="PUBLISHED")
    with pytest.raises(ValidationError):
        ProviderApprovalInput(provider_wallet=WALLET, price_usdc=Decimal("0.123456"))


# ── Group 4 — Publication ──────────────────────────────────────────────────────

def test_publish_requires_provider_approved(fake_db):
    _validated_state(fake_db)
    fake_db.row["provider_wallet"] = WALLET
    with pytest.raises(ValueError, match="not been approved"):
        publish_endpoint(ENDPOINT_ID, SOURCE_ID)
    assert fake_db.calls == []


def test_publish_requires_wallet_set(fake_db):
    _approved_state(fake_db)
    fake_db.row["provider_wallet"] = None
    with pytest.raises(ValueError, match="no provider wallet"):
        publish_endpoint(ENDPOINT_ID, SOURCE_ID)
    assert fake_db.calls == []


def test_publish_calls_transition_rpc(fake_db):
    _approved_state(fake_db)
    publish_endpoint(ENDPOINT_ID, SOURCE_ID)
    assert fake_db.calls == ["published"]
    assert fake_db.source_state == "PUBLISHED"


def test_publish_returns_updated_record(fake_db):
    _approved_state(fake_db)
    record = publish_endpoint(ENDPOINT_ID, SOURCE_ID)
    assert isinstance(record, EndpointRecord)
    assert record.status.value == "PUBLISHED"
    assert record.provider_wallet == WALLET


def test_publish_requires_review_key(fake_db, monkeypatch):
    _approved_state(fake_db)
    monkeypatch.setenv("PDQE_REVIEW_API_KEY", API_KEY)
    client = TestClient(app)
    url = f"/integration/publish/{ENDPOINT_ID}"
    body = {"source_id": str(SOURCE_ID)}
    assert client.post(url, json=body).status_code == 401
    assert client.post(url, json=body, headers={"X-PDQE-Review-Key": "wrong"}).status_code == 401
    assert fake_db.calls == []
    response = client.post(url, json=body, headers={"X-PDQE-Review-Key": API_KEY})
    assert response.status_code == 200
    assert response.json()["status"] == "PUBLISHED"


# ── Group 5 — x402 registration ────────────────────────────────────────────────

def test_x402_mock_returns_registration_result(fake_db):
    _published_state(fake_db)
    result = x402_client.register_endpoint(EndpointRecord.model_validate(fake_db.row))
    assert isinstance(result, X402RegistrationResult)
    assert result.mock is True
    assert result.registration_id.startswith("mock-")
    assert result.path == fake_db.row["path"]
    assert result.provider_wallet == WALLET


def test_x402_mock_registration_id_deterministic(fake_db):
    _published_state(fake_db)
    endpoint = EndpointRecord.model_validate(fake_db.row)
    first = x402_client.register_endpoint(endpoint).registration_id
    assert x402_client.register_endpoint(endpoint).registration_id == first
    assert first == x402_client.mock_registration_id(endpoint)
    other = endpoint.model_copy(update={"endpoint_hash": "c" * 64})
    assert x402_client.mock_registration_id(other) != first


def test_x402_registration_requires_published_status(fake_db):
    _approved_state(fake_db)
    with pytest.raises(ValueError, match="requires PUBLISHED"):
        run_x402_registration(ENDPOINT_ID, SOURCE_ID)
    assert fake_db.calls == []


def test_x402_registration_calls_transition_rpc(fake_db):
    _published_state(fake_db)
    result = run_x402_registration(ENDPOINT_ID, SOURCE_ID)
    assert fake_db.calls == ["x402_queryable"]
    assert fake_db.row["x402_registration_id"] == result.registration_id
    assert fake_db.source_state == "x402_QUERYABLE"


def test_x402_live_flag_false_never_makes_network_call(fake_db, monkeypatch):
    _published_state(fake_db)
    monkeypatch.setenv("X402_ADAPTER_URL", "https://adapter.example.invalid")
    monkeypatch.setenv("VITE_FLAG_LIVE_RPC_ACTIVE", "false")
    import httpx

    with (
        patch.object(httpx, "post", side_effect=AssertionError("network call in mock mode")) as post,
        patch.object(x402_client, "_register_live", side_effect=AssertionError("live path")) as live,
    ):
        result = x402_client.register_endpoint(EndpointRecord.model_validate(fake_db.row))
    post.assert_not_called()
    live.assert_not_called()
    assert result.mock is True


def test_x402_result_p9_validated(fake_db, monkeypatch):
    _published_state(fake_db)
    endpoint = EndpointRecord.model_validate(fake_db.row)
    good = {
        "registration_id": "reg_123",
        "path": endpoint.path,
        "price_usdc": "0.0100",
        "provider_wallet": WALLET,
        "registered_at": NOW,
        "cultural_sovereignty": False,
    }
    with pytest.raises(ValidationError):
        X402RegistrationResult.model_validate({**good, "callback": "https://evil.example"})
    with pytest.raises(ValidationError):
        X402RegistrationResult.model_validate({**good, "registration_id": "id; DROP TABLE"})

    monkeypatch.setenv("VITE_FLAG_LIVE_RPC_ACTIVE", "true")
    monkeypatch.setenv("X402_ADAPTER_URL", "https://adapter.example.invalid")

    class _Resp:
        def __init__(self, body):
            self._body = body

        def raise_for_status(self):
            return None

        def json(self):
            return self._body

    import httpx

    with (
        patch.object(httpx, "post", return_value=_Resp({**good, "provider_wallet": "B" * 58})),
        pytest.raises(ValueError, match="provider_wallet"),
    ):
        x402_client.register_endpoint(endpoint)
    with patch.object(httpx, "post", return_value=_Resp(good)) as post:
        result = x402_client.register_endpoint(endpoint)
    assert result.registration_id == "reg_123" and result.mock is False
    assert post.call_args.args[0] == "https://adapter.example.invalid/register"


# ── Group 6 — Full pipeline and HEALTH domain ─────────────────────────────────

def test_full_pipeline_validates_approves_publishes_registers(fake_db):
    output = run_full_pipeline(
        ENDPOINT_ID, SOURCE_ID, ProviderApprovalInput(provider_wallet=WALLET, price_usdc=Decimal("0.02"))
    )
    assert output.validation.passed
    assert fake_db.calls == ["endpoint_validated", "provider_approved", "published", "x402_queryable"]
    assert fake_db.source_state == "x402_QUERYABLE"
    assert fake_db.row["status"] == "PUBLISHED"
    assert output.registration is not None
    assert output.registration.price_usdc == Decimal("0.02")
    assert fake_db.row["x402_registration_id"] == output.registration.registration_id


def test_pipeline_health_endpoint_passes_validation(fake_db_factory, monkeypatch):
    fake = fake_db_factory(_row("HEALTH"))
    monkeypatch.setenv("PDQE_REVIEW_API_KEY", API_KEY)
    monkeypatch.setenv("PDQE_ALLOW_FULL_PIPELINE", "true")
    client = TestClient(app)
    response = client.post(
        f"/integration/pipeline/{ENDPOINT_ID}",
        json={"source_id": str(SOURCE_ID), "provider_wallet": WALLET},
        headers={"X-PDQE-Review-Key": API_KEY},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["validation"]["passed"] is True
    assert body["registration"]["path"].startswith("/pacific/health/")
    assert fake.source_state == "x402_QUERYABLE"


def test_pipeline_aborts_if_validation_fails(fake_db_factory, monkeypatch):
    row = _row()
    row["description"] = None
    fake = fake_db_factory(_rehash(row))
    output = run_full_pipeline(ENDPOINT_ID, SOURCE_ID, ProviderApprovalInput(provider_wallet=WALLET))
    assert output.validation.passed is False
    assert output.registration is None
    assert fake.calls == []
    # The HTTP shortcut is off unless explicitly enabled on the service.
    monkeypatch.setenv("PDQE_REVIEW_API_KEY", API_KEY)
    monkeypatch.delenv("PDQE_ALLOW_FULL_PIPELINE", raising=False)
    response = TestClient(app).post(
        f"/integration/pipeline/{ENDPOINT_ID}",
        json={"source_id": str(SOURCE_ID), "provider_wallet": WALLET},
        headers={"X-PDQE-Review-Key": API_KEY},
    )
    assert response.status_code == 403
