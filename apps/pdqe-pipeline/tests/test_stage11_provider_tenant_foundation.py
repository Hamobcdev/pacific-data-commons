"""
Stage 11 (1/N) — provider tenant foundation: review-key auth on the Stage 03–05
routes.

POST /extract, /qualify/{source_id} and /validate/{source_id} call Claude/Jev
and advance a source's lifecycle, so they now share the X-PDQE-Review-Key
guard used by every other state-changing route. The pipeline functions are
patched to fail loudly, proving a rejected request never reaches them.

The schema half of this PR (internal_pipeline default, provider_accounts,
the provider_account_id CHECK) is covered by
supabase/tests/03_pdqe_provider_tenant_foundation.sql.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

API_KEY = "test-review-key"
SOURCE_ID = str(uuid4())

ROUTES = [
    (
        "/extract",
        {
            "ingestion_id": str(uuid4()),
            "source_id": SOURCE_ID,
            "source_title": "Test source",
            "sanitised_content": "content",
        },
    ),
    (f"/qualify/{SOURCE_ID}", {"extraction_id": str(uuid4())}),
    (f"/validate/{SOURCE_ID}", None),
]


@pytest.fixture
def pipeline(monkeypatch):
    """Patch the pipeline entry points; each raises ValueError if reached."""
    import app.main as main

    mocks = {
        "run_extraction": MagicMock(side_effect=ValueError("reached extraction")),
        "qualify": AsyncMock(side_effect=ValueError("reached qualification")),
        "run_validation": MagicMock(side_effect=ValueError("reached validation")),
    }
    for name, mock in mocks.items():
        monkeypatch.setattr(main, name, mock)
    return mocks


@pytest.fixture
def client(monkeypatch):
    from app.main import app

    monkeypatch.setenv("PDQE_REVIEW_API_KEY", API_KEY)
    return TestClient(app)


def _post(client, path, body, headers=None):
    return client.post(path, json=body, headers=headers or {})


@pytest.mark.parametrize("path,body", ROUTES)
def test_returns_401_without_review_key(client, pipeline, path, body):
    assert _post(client, path, body).status_code == 401
    for mock in pipeline.values():
        mock.assert_not_called()


@pytest.mark.parametrize("path,body", ROUTES)
def test_returns_401_with_wrong_review_key(client, pipeline, path, body):
    response = _post(client, path, body, {"X-PDQE-Review-Key": "wrong"})
    assert response.status_code == 401
    for mock in pipeline.values():
        mock.assert_not_called()


@pytest.mark.parametrize("path,body", ROUTES)
def test_fails_closed_when_key_not_configured(client, pipeline, monkeypatch, path, body):
    monkeypatch.delenv("PDQE_REVIEW_API_KEY")
    response = _post(client, path, body, {"X-PDQE-Review-Key": API_KEY})
    assert response.status_code == 503
    for mock in pipeline.values():
        mock.assert_not_called()


def test_extract_with_key_reaches_pipeline(client, pipeline):
    path, body = ROUTES[0]
    # /extract maps any pipeline exception to 500
    assert _post(client, path, body, {"X-PDQE-Review-Key": API_KEY}).status_code == 500
    pipeline["run_extraction"].assert_called_once()


def test_qualify_with_key_reaches_pipeline(client, pipeline):
    path, body = ROUTES[1]
    response = _post(client, path, body, {"X-PDQE-Review-Key": API_KEY})
    assert response.status_code == 400
    assert response.json()["detail"] == "reached qualification"
    pipeline["qualify"].assert_awaited_once()


def test_validate_with_key_reaches_pipeline(client, pipeline):
    path, body = ROUTES[2]
    response = _post(client, path, body, {"X-PDQE-Review-Key": API_KEY})
    assert response.status_code == 400
    assert response.json()["detail"] == "reached validation"
    pipeline["run_validation"].assert_called_once()


def test_ingest_validate_stays_public(client):
    """Layer 1 pre-check writes nothing and stays unauthenticated."""
    response = client.post(
        "/ingest/validate", json={"file_name": "report.pdf", "file_extension": "pdf"}
    )
    assert response.status_code == 200
