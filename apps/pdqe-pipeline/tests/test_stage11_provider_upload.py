"""
Stage 11 (2/N) — provider registration + external upload entry point.

POST /provider/register and POST /ingest/submit authenticate with the
caller's Supabase JWT (verified by Supabase Auth via the service-role client)
and write pdqe.provider_accounts / pdqe.sources scoped to that user.

Supabase is faked at two seams: app.provider.auth._get_client (token
verification) and the app.provider.supabase_client functions (DB writes).
The query-building layer itself is covered against a fake client at the end.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from postgrest import APIError
from supabase_auth.errors import AuthApiError

import app.provider.supabase_client as provider_db
from app.provider import auth

VALID_TOKEN = "valid-token"
USER_ID = uuid4()
ACCOUNT_ID = str(uuid4())
SOURCE_ID = str(uuid4())
WALLET = "A" * 58
AUTH = {"Authorization": f"Bearer {VALID_TOKEN}"}

SUBMISSION = {
    "source_name": "Tonga tuna catch 2025",
    "source_url": "https://www.example.to/data/tuna-2025.csv",
    "domain": "FISHERIES",
    "licence_url": "https://creativecommons.org/licenses/by/4.0/",
    "description": "Annual longline catch by species.",
    "file_type": "CSV",
}


# ── Fixtures ───────────────────────────────────────────────────────────────────

class _FakeAuth:
    """Stands in for client.auth: only VALID_TOKEN resolves to a user."""

    def __init__(self, user=None, error: Exception | None = None):
        self.user = user or SimpleNamespace(id=str(USER_ID), is_anonymous=False)
        self.error = error

    def get_user(self, token):
        if self.error is not None:
            raise self.error
        if token != VALID_TOKEN:
            raise AuthApiError("invalid JWT", 401, "bad_jwt")
        return SimpleNamespace(user=self.user)


@pytest.fixture
def fake_auth(monkeypatch):
    fake = _FakeAuth()
    monkeypatch.setattr(auth, "_get_client", lambda: SimpleNamespace(auth=fake))
    return fake


@pytest.fixture
def db(monkeypatch):
    """Patch every provider DB function; defaults model an active account."""
    mocks = {
        "get_provider_account": MagicMock(
            return_value={"id": ACCOUNT_ID, "auth_user_id": str(USER_ID), "is_active": True}
        ),
        "insert_provider_account": MagicMock(return_value=ACCOUNT_ID),
        "insert_source": MagicMock(return_value=SOURCE_ID),
        "transition_to_registered": MagicMock(return_value=None),
        "delete_source": MagicMock(return_value=None),
    }
    for name, mock in mocks.items():
        monkeypatch.setattr(provider_db, name, mock)
    return SimpleNamespace(**mocks)


@pytest.fixture
def client(fake_auth, db):
    from app.main import app

    return TestClient(app)


def _register(client, body=None, headers=AUTH):
    return client.post("/provider/register", json=body if body is not None else {"verified_wallet": WALLET}, headers=headers)


def _submit(client, body=None, headers=AUTH, **overrides):
    payload = dict(SUBMISSION if body is None else body)
    payload.update(overrides)
    return client.post("/ingest/submit", json=payload, headers=headers)


# ── POST /provider/register ────────────────────────────────────────────────────

def test_register_valid_wallet_and_jwt_returns_account(client, db):
    db.get_provider_account.return_value = None
    response = _register(client)
    assert response.status_code == 200
    assert response.json() == {"provider_account_id": ACCOUNT_ID, "status": "registered"}
    db.insert_provider_account.assert_called_once_with(USER_ID, WALLET)


def test_register_duplicate_returns_409(client, db):
    response = _register(client)  # default fixture: account already exists
    assert response.status_code == 409
    assert response.json()["error"] == "provider_account_exists"
    db.insert_provider_account.assert_not_called()


def test_register_second_call_same_user_returns_409(client, db):
    accounts: dict = {}
    db.get_provider_account.side_effect = lambda uid: accounts.get(uid)

    def insert(uid, wallet):
        accounts[uid] = {"id": ACCOUNT_ID, "auth_user_id": str(uid), "is_active": True}
        return ACCOUNT_ID

    db.insert_provider_account.side_effect = insert
    assert _register(client).status_code == 200
    second = _register(client)
    assert second.status_code == 409
    assert db.insert_provider_account.call_count == 1


def test_register_race_on_unique_constraint_returns_409(client, db):
    db.get_provider_account.return_value = None
    db.insert_provider_account.side_effect = provider_db.DuplicateProviderAccount(str(USER_ID))
    assert _register(client).status_code == 409


@pytest.mark.parametrize(
    "wallet",
    ["A" * 57, "A" * 59, "a" * 58, "A" * 57 + "1", "A" * 57 + "0", "", 12345],
)
def test_register_invalid_wallet_returns_400(client, db, wallet):
    db.get_provider_account.return_value = None
    response = _register(client, {"verified_wallet": wallet})
    assert response.status_code == 400
    assert response.json()["field"] == "verified_wallet"
    db.insert_provider_account.assert_not_called()


def test_register_missing_wallet_returns_400(client, db):
    response = _register(client, {})
    assert response.status_code == 400
    assert response.json()["field"] == "verified_wallet"


def test_register_rejects_unknown_fields(client, db):
    # A body cannot pick its own owner, plan, activation state or PDC listing.
    db.get_provider_account.return_value = None
    response = _register(client, {"verified_wallet": WALLET, "provider_id": str(uuid4())})
    assert response.status_code == 400
    assert response.json()["field"] == "provider_id"
    db.insert_provider_account.assert_not_called()


def test_register_missing_jwt_returns_401(client, db):
    response = _register(client, headers={})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    db.get_provider_account.assert_not_called()
    db.insert_provider_account.assert_not_called()


@pytest.mark.parametrize(
    "header",
    ["Bearer wrong-token", f"Basic {VALID_TOKEN}", VALID_TOKEN, "Bearer ", "Bearer"],
)
def test_register_invalid_jwt_returns_401(client, db, header):
    response = _register(client, headers={"Authorization": header})
    assert response.status_code == 401
    db.insert_provider_account.assert_not_called()


def test_register_anonymous_user_returns_401(client, db, fake_auth):
    fake_auth.user = SimpleNamespace(id=str(USER_ID), is_anonymous=True)
    assert _register(client).status_code == 401
    db.insert_provider_account.assert_not_called()


def test_register_review_key_is_not_accepted_as_auth(client, db, monkeypatch):
    monkeypatch.setenv("PDQE_REVIEW_API_KEY", "review-key")
    response = _register(client, headers={"X-PDQE-Review-Key": "review-key"})
    assert response.status_code == 401


def test_register_auth_service_down_returns_503(client, db, fake_auth):
    fake_auth.error = ConnectionError("unreachable")
    assert _register(client).status_code == 503
    db.insert_provider_account.assert_not_called()


def test_register_auth_server_error_returns_503_not_401(client, db, fake_auth):
    fake_auth.error = AuthApiError("internal error", 500, "unexpected_failure")
    assert _register(client).status_code == 503


def test_register_db_error_returns_500_without_leaking_detail(client, db):
    db.get_provider_account.return_value = None
    db.insert_provider_account.side_effect = ValueError("relation pdqe.secret_table does not exist")
    response = _register(client)
    assert response.status_code == 500
    assert response.json()["error"] == "database_error"
    assert "secret_table" not in response.text


# ── POST /ingest/submit ────────────────────────────────────────────────────────

def test_submit_valid_request_registers_source(client, db):
    response = _submit(client)
    assert response.status_code == 200
    body = response.json()
    assert body == {
        "source_id": SOURCE_ID,
        "lifecycle_state": "SOURCE_REGISTERED",
        "message": "Source registered. SBP will begin processing within 2 business days.",
    }
    db.get_provider_account.assert_called_once_with(USER_ID)
    row = db.insert_source.call_args.args[0]
    assert row == {
        "title": "Tonga tuna catch 2025",
        "description": "Annual longline catch by species.",
        "publisher_name": "example.to",
        "source_url": "https://www.example.to/data/tuna-2025.csv",
        "source_type": "SPREADSHEET",
        "acquisition_method": "DIRECT_PROVISION",
        "licence_url": "https://creativecommons.org/licenses/by/4.0/",
        "candidate_domains": ["FISHERIES"],
        "registered_by": str(USER_ID),
        "internal_pipeline": False,
        "provider_account_id": ACCOUNT_ID,
    }
    # Licence is never set from the submission: UNKNOWN until SBP reviews it.
    assert "licence_status" not in row
    db.transition_to_registered.assert_called_once_with(SOURCE_ID, USER_ID)


def test_submit_does_not_trigger_pipeline(client, db, monkeypatch):
    """P9 + Decision 58: nothing past registration runs on an external submission."""
    from app import main

    for name in ("run_extraction", "qualify", "run_validation", "run_corpus"):
        monkeypatch.setattr(main, name, MagicMock(side_effect=AssertionError(f"{name} reached")))
    assert _submit(client).status_code == 200
    # Only DISCOVERED → SOURCE_REGISTERED; never LICENSE_CHECKED or beyond.
    assert db.transition_to_registered.call_count == 1


def test_submit_optional_fields_omitted(client, db):
    body = {k: SUBMISSION[k] for k in ("source_name", "source_url", "domain")}
    assert _submit(client, body).status_code == 200
    row = db.insert_source.call_args.args[0]
    assert row["source_type"] == "OTHER"
    assert row["licence_url"] is None
    assert row["description"] is None


def test_submit_no_provider_account_returns_403(client, db):
    db.get_provider_account.return_value = None
    response = _submit(client)
    assert response.status_code == 403
    assert response.json()["error"] == "no_active_provider_account"
    db.insert_source.assert_not_called()


def test_submit_inactive_provider_account_returns_403(client, db):
    db.get_provider_account.return_value = {"id": ACCOUNT_ID, "auth_user_id": str(USER_ID), "is_active": False}
    assert _submit(client).status_code == 403
    db.insert_source.assert_not_called()


@pytest.mark.parametrize("domain", ["FISHING", "fisheries_data", "SPORTS"])
def test_submit_invalid_domain_returns_422(client, db, domain):
    response = _submit(client, domain=domain)
    assert response.status_code == 422
    assert response.json()["error"] == "invalid_domain"
    assert response.json()["field"] == "domain"
    db.insert_source.assert_not_called()


@pytest.mark.parametrize("submitted,stored", [("ocean", "OCEAN"), ("Tourism", "TOURISM"), ("NONE_OF_THE_ABOVE", "OTHER")])
def test_submit_domain_normalised(client, db, submitted, stored):
    assert _submit(client, domain=submitted).status_code == 200
    assert db.insert_source.call_args.args[0]["candidate_domains"] == [stored]


@pytest.mark.parametrize(
    "url",
    [
        "http://www.example.to/data.csv",
        "ftp://example.to/data.csv",
        "example.to/data.csv",
        "https://",
        "https://localhost/data.csv",
        "https://127.0.0.1/data.csv",
        "https://10.0.0.5/data.csv",
        "https://169.254.169.254/latest/meta-data",
        "https://intranet/data.csv",
        "https://files.corp.internal/data.csv",
        "https://user:pass@example.to/data.csv",
        "https://example.to/" + "a" * 2100,
    ],
)
def test_submit_bad_source_url_returns_400(client, db, url):
    response = _submit(client, source_url=url)
    assert response.status_code == 400
    assert response.json()["field"] == "source_url"
    db.insert_source.assert_not_called()


def test_submit_missing_source_name_returns_400(client, db):
    body = {k: v for k, v in SUBMISSION.items() if k != "source_name"}
    response = _submit(client, body)
    assert response.status_code == 400
    assert response.json()["field"] == "source_name"
    db.insert_source.assert_not_called()


@pytest.mark.parametrize("field", ["source_url", "domain"])
def test_submit_missing_required_field_returns_400(client, db, field):
    body = {k: v for k, v in SUBMISSION.items() if k != field}
    response = _submit(client, body)
    assert response.status_code == 400
    assert response.json()["field"] == field


def test_submit_blank_source_name_returns_400(client, db):
    response = _submit(client, source_name="   ")
    assert response.status_code == 400
    assert response.json()["field"] == "source_name"


def test_submit_body_cannot_set_tenant_or_owner(client, db):
    for field, value in (
        ("provider_account_id", str(uuid4())),
        ("registered_by", str(uuid4())),
        ("internal_pipeline", True),
        ("licence_status", "CLEAR"),
    ):
        response = _submit(client, **{field: value})
        assert response.status_code == 400, field
        assert response.json()["field"] == field
    db.insert_source.assert_not_called()


def test_submit_non_object_body_returns_400(client, db):
    response = client.post("/ingest/submit", json=["not", "an", "object"], headers=AUTH)
    assert response.status_code == 400


@pytest.mark.parametrize("file_type", ["exe", "html", "zip"])
def test_submit_file_type_outside_layer1_whitelist_returns_400(client, db, file_type):
    response = _submit(client, file_type=file_type)
    assert response.status_code == 400
    assert response.json()["error"] == "file_type_not_permitted"
    assert response.json()["field"] == "file_type"
    db.insert_source.assert_not_called()


@pytest.mark.parametrize("file_type,source_type", [("PDF", "PDF_DOCUMENT"), (".json", "API_ENDPOINT"), ("docx", "OTHER")])
def test_submit_file_type_maps_to_source_type(client, db, file_type, source_type):
    assert _submit(client, file_type=file_type).status_code == 200
    assert db.insert_source.call_args.args[0]["source_type"] == source_type


def test_submit_http_licence_url_is_accepted(client, db):
    assert _submit(client, licence_url="http://www.gov.to/licence").status_code == 200


def test_submit_missing_jwt_returns_401(client, db):
    response = _submit(client, headers={})
    assert response.status_code == 401
    db.get_provider_account.assert_not_called()
    db.insert_source.assert_not_called()


def test_submit_invalid_jwt_returns_401(client, db):
    response = _submit(client, headers={"Authorization": "Bearer forged"})
    assert response.status_code == 401
    db.insert_source.assert_not_called()


def test_submit_db_error_returns_500(client, db):
    db.insert_source.side_effect = ValueError("insert failed")
    response = _submit(client)
    assert response.status_code == 500
    assert response.json()["error"] == "database_error"
    db.transition_to_registered.assert_not_called()


def test_submit_refused_transition_removes_source(client, db):
    db.transition_to_registered.side_effect = ValueError("PDQE invalid state transition")
    response = _submit(client)
    assert response.status_code == 500
    db.delete_source.assert_called_once_with(SOURCE_ID)


# ── Supabase query layer ──────────────────────────────────────────────────────

class _FakeQuery:
    """Records the PostgREST call chain; execute() returns `data` or raises `error`."""

    def __init__(self, data=None, error: Exception | None = None):
        self.calls: list[tuple] = []
        self.data = data
        self.error = error

    def __getattr__(self, name):
        def record(*args, **kwargs):
            self.calls.append((name, args, kwargs))
            return self
        return record

    def execute(self):
        if self.error is not None:
            raise self.error
        return SimpleNamespace(data=self.data)


@pytest.fixture
def fake_db(monkeypatch):
    query = _FakeQuery()
    monkeypatch.setattr(provider_db, "_get_client", lambda: query)
    return query


def test_get_provider_account_scopes_by_auth_user(fake_db):
    fake_db.data = [{"id": ACCOUNT_ID, "auth_user_id": str(USER_ID), "is_active": True}]
    assert provider_db.get_provider_account(USER_ID)["id"] == ACCOUNT_ID
    assert ("eq", ("auth_user_id", str(USER_ID)), {}) in fake_db.calls


def test_insert_provider_account_row_shape(fake_db):
    fake_db.data = [{"id": ACCOUNT_ID}]
    assert provider_db.insert_provider_account(USER_ID, WALLET) == ACCOUNT_ID
    insert = next(c for c in fake_db.calls if c[0] == "insert")
    assert insert[1][0] == {
        "auth_user_id": str(USER_ID),
        "verified_wallet": WALLET,
        "plan": "standard",
        "is_active": True,
    }


def test_insert_provider_account_unique_violation_is_duplicate(fake_db):
    fake_db.error = APIError({"code": "23505", "message": "duplicate key value"})
    with pytest.raises(provider_db.DuplicateProviderAccount):
        provider_db.insert_provider_account(USER_ID, WALLET)


def test_insert_provider_account_other_db_error_is_value_error(fake_db):
    fake_db.error = APIError({"code": "23514", "message": "check constraint"})
    with pytest.raises(ValueError):
        provider_db.insert_provider_account(USER_ID, WALLET)


def test_transition_to_registered_calls_state_machine(fake_db):
    provider_db.transition_to_registered(SOURCE_ID, USER_ID)
    rpc = next(c for c in fake_db.calls if c[0] == "rpc")
    name, params = rpc[1]
    assert name == "transition_source_state"
    assert params["p_source_id"] == SOURCE_ID
    assert params["p_state_to"] == "SOURCE_REGISTERED"
    assert params["p_actor_type"] == "HUMAN"
    assert UUID(params["p_actor_user_id"]) == USER_ID
