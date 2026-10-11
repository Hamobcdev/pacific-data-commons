"""
PDQE Stage 10.1 — Live corpus runner tests.

Covers:
  1. Fetcher (httpx mocked with MockTransport — no network)
  2. Runner refactor: direct pipeline calls, temp-file cleanup,
     DOGFOOD_AUTO_APPROVE guard + audit trail, /dogfood/review-queue
  3. TOURISM domain
  4. UNICEF WUENIC licence
  5. Integration: full live run through DirectPipelineClient with every
     pipeline function and Supabase call mocked
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.dogfood import fetcher as fetcher_mod
from app.dogfood import pipeline_client as pc
from app.dogfood import runner
from app.dogfood import supabase_client as db
from app.dogfood.fetcher import FetchError, FetchResult, fetch_source
from app.dogfood.loader import CORPUS_DIR, load_corpus
from app.dogfood.pipeline_client import DirectPipelineClient
from app.dogfood.runner import run_corpus
from app.dogfood.schemas import CORPUS_PRIMARY_DOMAIN, Corpus, DogfoodRunInput, RunOutcome, SeedSource
from app.endpoint.templates import get_path_template
from app.main import app
from app.qualification.schemas import DomainClassification
from app.security.layer2_sanitisation import Layer2Result
from tests.test_stage10_dogfooding import FakePipelineClient, FakeSupabase

API_KEY = "test-review-key"
OPERATOR = UUID("00000000-0000-4000-8000-000000000001")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _seed(**overrides) -> SeedSource:
    seed = load_corpus("FISHERIES")[1]
    return SeedSource.model_validate({**seed.model_dump(mode="json"), "licence_status": "CLEAR", **overrides})


@pytest.fixture
def mock_http(monkeypatch):
    """Route every httpx.Client the fetcher builds through a MockTransport handler."""
    state: dict = {"requests": []}
    real_client = httpx.Client

    def _client(**kwargs):
        def handler(request: httpx.Request) -> httpx.Response:
            state["requests"].append(request)
            return state["handler"](request)

        return real_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(fetcher_mod.httpx, "Client", _client)
    return state


class _FetchSpy:
    """Fake fetcher that writes a real temp file and remembers its path."""

    def __init__(self, content: bytes = b"year,country,value\n2024,WSM,1\n") -> None:
        self.paths: list[str] = []
        self._content = content

    def __call__(self, seed: SeedSource, tmp_dir: str) -> FetchResult:
        path = Path(tmp_dir) / f"fetch-{uuid4().hex}.csv"
        path.write_bytes(self._content)
        self.paths.append(str(path))
        return FetchResult(
            source_url=seed.source_url, local_path=str(path), content_type="text/csv",
            size_bytes=path.stat().st_size, fetch_strategy="direct_download",
        )


def _live(client, monkeypatch, seeds, fetch=None, **kwargs):
    monkeypatch.setattr(runner, "load_corpus", lambda domain: seeds)
    return run_corpus(
        DogfoodRunInput(domain="FISHERIES", dry_run=False, **kwargs), client=client, fetcher=fetch or _FetchSpy()
    )


@pytest.fixture
def auto_approve(monkeypatch):
    monkeypatch.setenv("DOGFOOD_AUTO_APPROVE", "true")
    monkeypatch.setenv("PDQE_ENVIRONMENT", "development")


@pytest.fixture
def no_auto_approve(monkeypatch):
    monkeypatch.delenv("DOGFOOD_AUTO_APPROVE", raising=False)
    monkeypatch.delenv("PDQE_ENVIRONMENT", raising=False)


class _Dump(dict):
    """Stands in for a pipeline pydantic model: model_dump() → dict."""

    def model_dump(self, mode=None):  # noqa: ARG002
        return dict(self)


def _layer2_pass(raw: bytes, ext: str) -> Layer2Result:
    import hashlib

    return Layer2Result(passed=True, content_hash=hashlib.sha256(raw).hexdigest(), sanitised_content=raw)


@pytest.fixture
def direct(monkeypatch):
    """
    DirectPipelineClient with every Supabase call and pipeline function
    replaced by an in-memory recorder. `calls` lists (name, args) in order.
    """
    calls: list[tuple] = []

    def rec(name, result=None):
        def _fn(*args, **kwargs):
            calls.append((name, args, kwargs))
            return result() if callable(result) else result
        return _fn

    monkeypatch.setattr(pc.db, "insert_source", rec("insert_source", lambda: str(uuid4())))
    monkeypatch.setattr(pc.db, "transition_source", rec("transition_source"))
    monkeypatch.setattr(
        pc.db, "insert_ingestion_event",
        rec("insert_ingestion_event", lambda: {"ingestion_id": str(uuid4()), "layer1_passed": True}),
    )
    monkeypatch.setattr(pc.db, "update_ingestion_event", rec("update_ingestion_event"))
    monkeypatch.setattr(pc.db, "log_security_check", rec("log_security_check"))
    monkeypatch.setattr(pc.db, "set_source_content_hash", rec("set_source_content_hash"))
    monkeypatch.setattr(
        pc, "run_extraction",
        rec("run_extraction", lambda: SimpleNamespace(
            extraction_id=str(uuid4()), error=None,
            validation_result=SimpleNamespace(passed=True, rejection_reason=None),
        )),
    )

    async def _qualify(extraction_id):
        calls.append(("qualify", (extraction_id,), {}))
        return _Dump(routing_decision="AUTO_APPROVE")

    monkeypatch.setattr(pc, "qualify", _qualify)
    monkeypatch.setattr(
        pc, "run_validation",
        rec("run_validation", lambda: _Dump(outcome="VALIDATED", outcome_reason="all validators passed")),
    )
    monkeypatch.setattr(pc, "create_dataset", rec("create_dataset", lambda: _Dump(dataset_id=str(uuid4()))))
    monkeypatch.setattr(pc.dataset_db, "find_collection_by_name", rec("find_collection_by_name"))
    monkeypatch.setattr(pc, "create_collection", rec("create_collection", lambda: _Dump(collection_id=str(uuid4()))))
    monkeypatch.setattr(pc, "link_dataset_to_collection", rec("link_dataset_to_collection", lambda: _Dump()))
    monkeypatch.setattr(
        pc, "generate_endpoint",
        rec("generate_endpoint", lambda: _Dump(endpoint_id=str(uuid4()), status="DRAFT")),
    )
    client = DirectPipelineClient(OPERATOR, layer2=_layer2_pass)
    return SimpleNamespace(client=client, calls=calls, names=lambda: [c[0] for c in calls])


# ── 1. Fetcher ────────────────────────────────────────────────────────────────

def test_fetch_direct_download_returns_result(mock_http, tmp_path):
    mock_http["handler"] = lambda req: httpx.Response(
        200, headers={"content-type": "text/csv; charset=utf-8"}, content=b"a,b\n1,2\n"
    )
    result = fetch_source(_seed(source_url="https://data.example.org/file.csv"), str(tmp_path))
    assert result.fetch_strategy == "direct_download"
    assert result.content_type == "text/csv"
    assert result.size_bytes == 8
    assert Path(result.local_path).read_bytes() == b"a,b\n1,2\n"
    assert str(mock_http["requests"][0].url) == "https://data.example.org/file.csv"


def test_fetch_sdmx_url_appends_csv_format(mock_http, tmp_path):
    mock_http["handler"] = lambda req: httpx.Response(
        200, headers={"content-type": "application/vnd.sdmx.data+csv; version=1.0"}, content=b"x\n1"
    )
    url = "https://stats-nsi-stable.pacificdata.org/rest/data/SPC,DF_TRADE,1.0/all"
    result = fetch_source(_seed(source_url=url), str(tmp_path))
    assert result.fetch_strategy == "sdmx_api"
    assert result.content_type == "text/csv"  # SDMX-CSV MIME normalised
    assert str(mock_http["requests"][0].url) == url + "?format=csv"
    # An existing query string is extended; an explicit format is left alone.
    fetch_source(_seed(source_url=url + "?startPeriod=2020"), str(tmp_path))
    assert str(mock_http["requests"][1].url) == url + "?startPeriod=2020&format=csv"
    fetch_source(_seed(source_url=url + "?format=csvfile"), str(tmp_path))
    assert str(mock_http["requests"][2].url) == url + "?format=csvfile"


def test_fetch_odata_url_appends_json_format(mock_http, tmp_path):
    mock_http["handler"] = lambda req: httpx.Response(
        200, headers={"content-type": "application/json; odata.metadata=minimal"}, content=b'{"value": []}'
    )
    url = "https://ghoapi.azureedge.net/api/WHOSIS_000001"
    result = fetch_source(_seed(source_url=url), str(tmp_path))
    assert result.fetch_strategy == "odata_api"
    assert result.content_type == "application/json"
    assert mock_http["requests"][0].url.params["$format"] == "json"
    assert mock_http["requests"][0].url.params["$top"] == "1000"


def test_fetch_excluded_licence_raises(mock_http, tmp_path):
    mock_http["handler"] = lambda req: httpx.Response(200, content=b"x")
    with pytest.raises(FetchError, match="EXCLUDED"):
        fetch_source(_seed(licence_status="EXCLUDED"), str(tmp_path))
    assert mock_http["requests"] == []  # no network call at all
    assert list(tmp_path.iterdir()) == []


def test_fetch_http_error_raises_fetch_error(mock_http, tmp_path):
    mock_http["handler"] = lambda req: httpx.Response(404, headers={"content-type": "text/csv"}, content=b"nope")
    with pytest.raises(FetchError, match="HTTP 404"):
        fetch_source(_seed(), str(tmp_path))
    assert list(tmp_path.iterdir()) == []  # partial file removed


def test_fetch_timeout_raises_fetch_error(mock_http, tmp_path):
    def _timeout(request):
        raise httpx.ReadTimeout("read timed out", request=request)

    mock_http["handler"] = _timeout
    with pytest.raises(FetchError, match="timeout") as info:
        fetch_source(_seed(), str(tmp_path))
    assert not isinstance(info.value, httpx.HTTPError)  # never a raw httpx exception
    assert list(tmp_path.iterdir()) == []


def test_fetch_oversized_content_raises_fetch_error(mock_http, tmp_path, monkeypatch):
    monkeypatch.setattr(fetcher_mod, "MAX_CONTENT_BYTES", 16)
    # No Content-Length: the cap is enforced while streaming.
    mock_http["handler"] = lambda req: httpx.Response(
        200, headers={"content-type": "text/csv"}, stream=httpx.ByteStream(b"x" * 64)
    )
    with pytest.raises(FetchError, match="exceeds"):
        fetch_source(_seed(), str(tmp_path))
    # Declared Content-Length over the cap is refused before reading the body.
    mock_http["handler"] = lambda req: httpx.Response(
        200, headers={"content-type": "text/csv", "content-length": "1000"}, content=b"x" * 1000
    )
    with pytest.raises(FetchError, match="exceeds"):
        fetch_source(_seed(), str(tmp_path))
    assert list(tmp_path.iterdir()) == []


def test_fetch_disallowed_content_type_raises_fetch_error(mock_http, tmp_path):
    mock_http["handler"] = lambda req: httpx.Response(
        200, headers={"content-type": "text/html; charset=utf-8"}, content=b"<html></html>"
    )
    with pytest.raises(FetchError, match="text/html"):
        fetch_source(_seed(), str(tmp_path))
    assert list(tmp_path.iterdir()) == []


# ── 2. Runner refactor ────────────────────────────────────────────────────────

def test_live_run_calls_register_source_directly(direct, monkeypatch, no_auto_approve):
    report = _live(direct.client, monkeypatch, [_seed()])
    insert = next(c for c in direct.calls if c[0] == "insert_source")
    row = insert[1][0]
    assert row["registered_by"] == str(OPERATOR)
    assert row["candidate_domains"] == ["FISHERIES"] and row["licence_status"] == "CLEAR"
    assert row["source_type"] == "SPREADSHEET" and row["acquisition_method"] == "WEB_SCRAPE"
    states = [c[1][1] for c in direct.calls if c[0] == "transition_source"]
    assert states == ["SOURCE_REGISTERED", "LICENSE_CHECKED", "INGESTED"]
    # In-process calls, not HTTP self-calls: the stage functions were invoked.
    assert {"run_extraction", "qualify", "run_validation"} <= set(direct.names())
    assert report.results[0].outcome == RunOutcome.ROUTED_TO_REVIEW  # no auto-approve


def test_live_run_cleans_up_temp_file_on_success(monkeypatch, auto_approve):
    spy = _FetchSpy()
    report = _live(FakePipelineClient(), monkeypatch, [_seed()], fetch=spy)
    assert report.results[0].outcome == RunOutcome.SUCCESS
    assert len(spy.paths) == 1
    assert not os.path.exists(spy.paths[0])


def test_live_run_cleans_up_temp_file_on_error(direct, monkeypatch, no_auto_approve):
    # The real Layer 2 rejects content with nothing extractable: ingestion
    # must fail closed (never bypass sanitisation), record it, and clean up.
    from app.security.layer2_sanitisation import run_layer2

    client = DirectPipelineClient(OPERATOR, layer2=run_layer2)
    spy = _FetchSpy(content=b"=\n@\n+-\n")  # only formula prefixes: nothing left
    result = _live(client, monkeypatch, [_seed()], fetch=spy).results[0]
    assert result.outcome == RunOutcome.FAILED_INGESTION
    assert result.stage_reached == "SOURCE_REGISTERED"
    assert "Layer 2" in result.error
    assert not os.path.exists(spy.paths[0])
    updates = [c[1][1] for c in direct.calls if c[0] == "update_ingestion_event"]
    assert updates and updates[-1]["status"] == "LAYER2_FAILED"
    assert "run_extraction" not in direct.names()


def test_live_run_routed_to_review_without_auto_approve(monkeypatch, no_auto_approve):
    client = FakePipelineClient()
    report = _live(client, monkeypatch, [_seed()])
    result = report.results[0]
    assert result.outcome == RunOutcome.ROUTED_TO_REVIEW
    assert result.stage_reached == "VALIDATED"
    assert "dogfood_auto_approve" not in client.calls
    assert "create_dataset" not in client.calls
    assert report.auto_approved_sources == []


def test_live_run_auto_approve_advances_source(monkeypatch, auto_approve):
    client = FakePipelineClient()
    result = _live(client, monkeypatch, [_seed()]).results[0]
    assert result.outcome == RunOutcome.SUCCESS
    assert client.calls.index("dogfood_auto_approve") == client.calls.index("validate") + 1
    assert client.calls.index("create_dataset") > client.calls.index("dogfood_auto_approve")
    # Auto-approve never overrides a Stage 05 REVIEW outcome.
    review_client = FakePipelineClient(validation_outcome="REVIEW")
    assert _live(review_client, monkeypatch, [_seed()]).results[0].stage_reached == "REVIEW"
    assert "dogfood_auto_approve" not in review_client.calls


def test_auto_approve_raises_without_env_var(monkeypatch, no_auto_approve):
    client = FakePipelineClient()
    with pytest.raises(RuntimeError, match="DOGFOOD_AUTO_APPROVE"):
        runner._auto_approve_source(uuid4(), _seed(), "label", client)
    assert client.calls == []
    # Requested on a production (or unconfigured) service → the run is refused.
    monkeypatch.setenv("DOGFOOD_AUTO_APPROVE", "true")
    with pytest.raises(RuntimeError):
        runner._auto_approve_source(uuid4(), _seed(), "label", client)
    for env in ("production", ""):
        monkeypatch.setenv("PDQE_ENVIRONMENT", env)
        with pytest.raises(ValueError, match="PDQE_ENVIRONMENT"):
            _live(client, monkeypatch, [_seed()])
    assert client.calls == []
    # A dry run never consults the flag.
    assert run_corpus(DogfoodRunInput(domain="FISHERIES")).dry_run is True


def test_auto_approve_logs_warning_with_action_required(monkeypatch, auto_approve, caplog):
    seed = _seed()
    with caplog.at_level(logging.WARNING, logger="app.dogfood.runner"):
        runner._auto_approve_source(uuid4(), seed, "stage10-test", FakePipelineClient())
    record = next(r for r in caplog.records if "DOGFOOD_AUTO_APPROVE" in r.getMessage())
    assert record.levelno == logging.WARNING
    assert record.source_url == seed.source_url
    assert record.run_label == "stage10-test"
    assert "bypassed human licence review" in record.action_required
    assert "review queue" in record.action_required


def test_auto_approve_appends_to_report_auto_approved_list(monkeypatch, auto_approve):
    seeds = [
        _seed(source_url="https://a.example.org/"),
        _seed(source_url="https://b.example.org/", licence_status="UNKNOWN"),
    ]
    report = _live(FakePipelineClient(), monkeypatch, seeds)
    assert len(report.auto_approved_sources) == 1
    entry = report.auto_approved_sources[0]
    assert entry.source_url == "https://a.example.org/"
    assert entry.source_id == report.results[0].source_id
    assert entry.domain == DomainClassification.FISHERIES
    assert entry.licence_status.value == "CLEAR"


def test_run_report_auto_approved_sources_non_empty_when_bypassed(monkeypatch, auto_approve):
    fake = FakeSupabase()
    monkeypatch.setattr(db, "_get_client", lambda: fake)
    run_corpus(DogfoodRunInput(domain="FISHERIES", run_label="dry"), write_to_db=True)
    monkeypatch.setattr(runner, "load_corpus", lambda domain: [_seed()])
    live = run_corpus(
        DogfoodRunInput(domain="FISHERIES", dry_run=False, run_label="live"),
        write_to_db=True, client=FakePipelineClient(), fetcher=_FetchSpy(),
    )
    dry_row, live_row = fake.dogfood_runs
    # Stored in pdqe.dogfood_runs.run_report JSONB — queryable later.
    assert dry_row["run_report"]["auto_approved_sources"] == []
    stored = live_row["run_report"]["auto_approved_sources"]
    assert len(stored) == 1
    assert stored[0]["source_url"] == _seed().source_url
    assert stored[0]["source_id"] == str(live.results[0].source_id)
    assert live_row["dry_run"] is False


def test_review_queue_endpoint_returns_auto_approved_sources(monkeypatch):
    monkeypatch.setenv("PDQE_REVIEW_API_KEY", API_KEY)
    pending_id, confirmed_id = uuid4(), uuid4()

    def _entry(sid, url):
        return {"source_id": str(sid), "source_url": url, "title": "Seed title", "domain": "TOURISM",
                "licence_status": "REVIEW_REQUIRED"}

    runs = [
        {"run_id": str(uuid4()), "run_label": "newer", "started_at": "2026-10-12T02:00:00+00:00",
         "run_report": {"auto_approved_sources": [_entry(pending_id, "https://a.example.org/")]}},
        {"run_id": str(uuid4()), "run_label": "older", "started_at": "2026-10-12T01:00:00+00:00",
         "run_report": {"auto_approved_sources": [_entry(confirmed_id, "https://b.example.org/"),
                                                  _entry(pending_id, "https://a.example.org/")]}},
    ]
    monkeypatch.setattr(db, "list_live_run_reports", lambda: runs)
    monkeypatch.setattr(
        db, "fetch_licence_confirmations",
        lambda ids: {str(pending_id): None, str(confirmed_id): str(uuid4())},
    )
    api = TestClient(app)
    assert api.get("/dogfood/review-queue").status_code == 401
    resp = api.get("/dogfood/review-queue", headers={"X-PDQE-Review-Key": API_KEY})
    assert resp.status_code == 200
    body = resp.json()
    # Confirmed source dropped; pending source listed once, under its latest run.
    assert [e["source_id"] for e in body] == [str(pending_id)]
    assert body[0]["run_label"] == "newer"
    assert set(body[0]) == {"run_id", "run_label", "source_id", "source_url", "title", "domain",
                            "licence_status", "run_started_at"}


# ── 3. TOURISM domain ─────────────────────────────────────────────────────────

def test_tourism_corpus_loads_with_tourism_domain():
    seeds = load_corpus("TOURISM")
    assert len(seeds) == 5
    assert all(s.domain == DomainClassification.TOURISM for s in seeds)
    assert CORPUS_PRIMARY_DOMAIN[Corpus.TOURISM] == DomainClassification.TOURISM


def test_tourism_seed_domain_is_tourism_not_economics():
    raw = json.loads((CORPUS_DIR / "tourism.json").read_text())
    assert {entry["domain"] for entry in raw} == {"TOURISM"}
    # ECONOMICS stays an alias of the trade corpus, not tourism.
    assert runner.resolve_corpus("ECONOMICS") == Corpus.TRADE


def test_runner_accepts_tourism_domain(monkeypatch, auto_approve):
    dry = run_corpus(DogfoodRunInput(domain="tourism"))
    assert dry.corpus == Corpus.TOURISM and dry.sources_attempted == 5
    assert all(r.domain == DomainClassification.TOURISM for r in dry.results)
    seed = SeedSource.model_validate({**load_corpus("TOURISM")[0].model_dump(mode="json"), "licence_status": "CLEAR"})
    client = FakePipelineClient()
    monkeypatch.setattr(runner, "load_corpus", lambda domain: [seed])
    live = run_corpus(DogfoodRunInput(domain="TOURISM", dry_run=False), client=client, fetcher=_FetchSpy())
    assert live.results[0].outcome == RunOutcome.SUCCESS
    assert get_path_template("TOURISM", "samoa-arrivals") == "/pacific/tourism/samoa-arrivals"


# ── 4. UNICEF licence ─────────────────────────────────────────────────────────

def test_unicef_wuenic_seed_has_clear_licence():
    wuenic = [s for s in load_corpus("HEALTH") if "WUENIC" in s.title]
    assert len(wuenic) == 1
    seed = wuenic[0]
    assert seed.licence_status.value == "CLEAR"
    assert seed.licence_url == "https://data.unicef.org/resources/dataset/immunization/"
    assert "CC BY 3.0 IGO" in seed.notes


# ── 5. Integration ────────────────────────────────────────────────────────────

def test_live_run_full_pipeline_succeeds_with_mocks(direct, monkeypatch, auto_approve):
    spy = _FetchSpy()
    report = _live(direct.client, monkeypatch, [_seed()], fetch=spy)
    result = report.results[0]
    assert result.outcome == RunOutcome.SUCCESS
    assert result.stage_reached == "ENDPOINT_GENERATED"
    states = [c[1][1] for c in direct.calls if c[0] == "transition_source"]
    assert states == ["SOURCE_REGISTERED", "LICENSE_CHECKED", "INGESTED", "APPROVED"]
    assert "DOGFOOD_AUTO_APPROVE" in [c for c in direct.calls if c[0] == "transition_source"][-1][1][2]
    order = [n for n in direct.names() if n in {
        "insert_source", "insert_ingestion_event", "run_extraction", "qualify", "run_validation",
        "create_dataset", "create_collection", "link_dataset_to_collection", "generate_endpoint"}]
    assert order == ["insert_source", "insert_ingestion_event", "run_extraction", "qualify", "run_validation",
                     "create_dataset", "create_collection", "link_dataset_to_collection", "generate_endpoint"]
    # Layer 2 sanitised content (not the raw file path) is what extraction saw.
    extraction = next(c for c in direct.calls if c[0] == "run_extraction")
    assert extraction[2]["sanitised_content"].startswith("year,country,value")
    gen = next(c for c in direct.calls if c[0] == "generate_endpoint")
    assert gen[1][1] is not None  # primary collection passed through
    assert len(report.auto_approved_sources) == 1
    assert not os.path.exists(spy.paths[0])


def test_live_run_health_domain_full_pipeline(direct, monkeypatch, auto_approve):
    spy = _FetchSpy()
    report = run_corpus(
        DogfoodRunInput(domain="HEALTH", dry_run=False), client=direct.client, fetcher=spy
    )
    outcomes = {r.title: r.outcome for r in report.results}
    # RESTRICTED (WHO GHO) and CLEAR (UNICEF WUENIC) run end to end; the three
    # UNKNOWN seeds are registered and halted for licence review, never fetched.
    succeeded = [t for t, o in outcomes.items() if o == RunOutcome.SUCCESS]
    assert len(succeeded) == 2 and any("WUENIC" in t for t in succeeded)
    assert report.sources_routed_to_review == 3
    assert len(spy.paths) == 2
    assert all(not os.path.exists(p) for p in spy.paths)
    assert {s.licence_status.value for s in report.auto_approved_sources} == {"CLEAR", "RESTRICTED"}
    # One collection created for the run, then reused.
    assert direct.names().count("create_collection") == 1
    created = next(c for c in direct.calls if c[0] == "create_collection")
    assert created[1][0].domain == DomainClassification.HEALTH
