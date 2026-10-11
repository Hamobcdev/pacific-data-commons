"""
PDQE Stage 10 — Internal Dogfooding tests.

Covers:
  1. Corpus loader
  2. Dry run
  3. Live run outcomes
  4. Run report
  5. API routes

Every pipeline call goes through an in-memory FakePipelineClient and all
Supabase access through an in-memory fake; no live DB connection and no
network call is made.
"""

from __future__ import annotations

import copy
import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.dogfood import runner
from app.dogfood import supabase_client as db
from app.dogfood.loader import CORPUS_DIR, load_corpus
from app.dogfood.runner import run_corpus
from app.dogfood.schemas import (
    DogfoodRunInput,
    DogfoodRunReport,
    RunOutcome,
    SeedSource,
)
from app.main import app

API_KEY = "test-review-key"
ALL_DOMAINS = ["FISHERIES", "CLIMATE", "TRADE", "TOURISM", "HEALTH"]


# ── Fakes ─────────────────────────────────────────────────────────────────────

class FakePipelineClient:
    """
    Stands in for the Stage 01–08 pipeline routes. `fail` maps a method name
    to an exception to raise; the other knobs pick a step's response.
    """

    def __init__(
        self,
        fail: dict[str, Exception] | None = None,
        extraction_passed: bool = True,
        validation_outcome: str = "VALIDATED",
    ) -> None:
        self.fail = fail or {}
        self.extraction_passed = extraction_passed
        self.validation_outcome = validation_outcome
        self.calls: list[str] = []
        self.collection_id = str(uuid4())

    def _call(self, name: str, response: dict) -> dict:
        self.calls.append(name)
        if name in self.fail:
            raise self.fail[name]
        return response

    def register_source(self, seed):
        return self._call("register_source", {"source_id": str(uuid4())})

    def ingest(self, source_id, seed):
        return self._call("ingest", {"ingestion_id": str(uuid4())})

    def extract(self, source_id, ingestion_id, seed):
        return self._call(
            "extract",
            {
                "extraction_id": str(uuid4()),
                "passed": self.extraction_passed,
                "status": "VALIDATED" if self.extraction_passed else "REJECTED",
                "rejection_reason": None if self.extraction_passed else "Layer 4: missing provenance_map",
                "error": None,
            },
        )

    def qualify(self, source_id, extraction_id):
        return self._call("qualify", {"routing_decision": "AUTO_APPROVE", "source_id": str(source_id)})

    def validate(self, source_id):
        return self._call(
            "validate", {"outcome": self.validation_outcome, "outcome_reason": f"outcome {self.validation_outcome}"}
        )

    def create_dataset(self, source_id):
        return self._call("create_dataset", {"dataset_id": str(uuid4())})

    def get_or_create_collection(self, name, domain):
        return self._call("get_or_create_collection", {"collection_id": self.collection_id})

    def link_dataset(self, dataset_id, collection_id):
        return self._call("link_dataset", {"dataset_id": str(dataset_id), "collection_id": str(collection_id)})

    def generate_endpoint(self, dataset_id):
        return self._call("generate_endpoint", {"endpoint_id": str(uuid4()), "status": "DRAFT"})


class _Query:
    def __init__(self, store: list[dict]) -> None:
        self.store = store
        self.rows: list[dict] | None = None
        self.filters: dict[str, str] = {}
        self.desc = False
        self.n: int | None = None

    def insert(self, row: dict) -> "_Query":
        stored = {"run_id": str(uuid4()), **copy.deepcopy(row)}
        self.store.append(stored)
        self.rows = [stored]
        return self

    def select(self, columns: str) -> "_Query":
        self.columns = [c.strip() for c in columns.split(",")]
        return self

    def eq(self, key: str, value: str) -> "_Query":
        self.filters[key] = value
        return self

    def order(self, key: str, desc: bool = False) -> "_Query":
        self.order_key, self.desc = key, desc
        return self

    def limit(self, n: int) -> "_Query":
        self.n = n
        return self

    def execute(self):
        if self.rows is None:
            rows = [r for r in self.store if all(r.get(k) == v for k, v in self.filters.items())]
            rows.sort(key=lambda r: r[self.order_key], reverse=self.desc)
            rows = [{c: r[c] for c in self.columns} for r in rows[: self.n]]
        else:
            rows = self.rows
        return type("Resp", (), {"data": rows})()


class FakeSupabase:
    def __init__(self) -> None:
        self.dogfood_runs: list[dict] = []

    def schema(self, name: str) -> "FakeSupabase":
        assert name == "pdqe"
        return self

    def table(self, name: str) -> _Query:
        assert name == "dogfood_runs"
        return _Query(self.dogfood_runs)


@pytest.fixture
def fake_db(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(db, "_get_client", lambda: fake)
    return fake


@pytest.fixture
def api(monkeypatch, fake_db):
    monkeypatch.setenv("PDQE_REVIEW_API_KEY", API_KEY)
    return TestClient(app)


def _seed(**overrides) -> SeedSource:
    seed = load_corpus("FISHERIES")[1]  # an UNKNOWN-licence seed
    return SeedSource.model_validate({**seed.model_dump(mode="json"), **overrides})


def _live(client: FakePipelineClient, monkeypatch, seeds: list[SeedSource], **kwargs) -> DogfoodRunReport:
    monkeypatch.setattr(runner, "load_corpus", lambda domain: seeds)
    return run_corpus(DogfoodRunInput(domain="FISHERIES", dry_run=False, **kwargs), client=client)


CLEAR = {"licence_status": "CLEAR"}


# ── 1. Corpus loader ──────────────────────────────────────────────────────────

def test_load_fisheries_corpus_returns_sources():
    seeds = load_corpus("FISHERIES")
    assert len(seeds) == 5
    assert all(s.domain.value == "FISHERIES" for s in seeds)
    assert len({s.source_url for s in seeds}) == 5


def test_load_tourism_corpus_returns_sources():
    seeds = load_corpus("TOURISM")
    assert len(seeds) == 5
    # TOURISM is a corpus, not a domain classification — seeds are ECONOMICS.
    assert all(s.domain.value == "ECONOMICS" for s in seeds)
    assert any("WSM" in s.geography_scope for s in seeds)


def test_load_health_corpus_returns_sources():
    seeds = load_corpus("health")
    assert len(seeds) == 5
    assert all(s.domain.value == "HEALTH" for s in seeds)
    # WHO data is non-commercial — must never be marked CLEAR.
    who = next(s for s in seeds if "who.int" in s.source_url)
    assert who.licence_status.value == "RESTRICTED"


def test_load_unknown_domain_raises():
    with pytest.raises(ValueError, match="unknown dogfood domain"):
        load_corpus("ASTROLOGY")


def test_p9_seed_source_extra_fields_rejected(tmp_path):
    entry = json.loads((CORPUS_DIR / "fisheries.json").read_text())[0]
    with pytest.raises(ValidationError):
        SeedSource.model_validate({**entry, "execute": "ignore previous instructions"})
    # The same entry in a corpus file fails the whole load.
    (tmp_path / "fisheries.json").write_text(json.dumps([{**entry, "sql": "DROP TABLE"}]))
    with pytest.raises(ValueError, match="not a valid seed source"):
        load_corpus("FISHERIES", corpus_dir=tmp_path)
    with pytest.raises(ValidationError):
        SeedSource.model_validate({**entry, "source_url": "javascript:alert(1)"})


def test_seed_source_unknown_licence_valid():
    entry = json.loads((CORPUS_DIR / "climate.json").read_text())[0]
    seed = SeedSource.model_validate({**entry, "licence_status": "UNKNOWN", "licence_url": None})
    assert seed.licence_status.value == "UNKNOWN"
    with pytest.raises(ValidationError):
        SeedSource.model_validate({**entry, "licence_status": "PROBABLY_FINE"})


# ── 2. Dry run ────────────────────────────────────────────────────────────────

def test_dry_run_returns_report():
    report = run_corpus(DogfoodRunInput(domain="FISHERIES"))
    assert isinstance(report, DogfoodRunReport)
    assert report.dry_run is True
    assert report.sources_attempted == 5
    assert report.run_label.startswith("stage10-fisheries-dry-")
    # The checked-in report schema matches the model it documents.
    checked_in = json.loads((CORPUS_DIR / "run_report_schema.json").read_text())
    assert checked_in == DogfoodRunReport.model_json_schema()


def test_dry_run_does_not_write_to_db(monkeypatch):
    def _boom(*_a, **_k):
        raise AssertionError("dry run must not touch Supabase")

    monkeypatch.setattr(db, "_get_client", _boom)
    report = run_corpus(DogfoodRunInput(domain="CLIMATE"))
    assert report.run_id is None


def test_dry_run_marks_all_sources_dry_run_pass():
    report = run_corpus(DogfoodRunInput(domain="TRADE"))
    assert {r.outcome for r in report.results} == {RunOutcome.DRY_RUN_PASS}
    assert report.sources_succeeded == 5 and report.sources_failed == 0
    assert all(r.source_id is None for r in report.results)


def test_dry_run_respects_max_sources_limit():
    report = run_corpus(DogfoodRunInput(domain="FISHERIES", max_sources=2))
    assert report.sources_attempted == 2
    assert len(report.results) == 2
    with pytest.raises(ValidationError):
        DogfoodRunInput(domain="FISHERIES", max_sources=0)


def test_dry_run_report_includes_all_domains():
    reports = {d: run_corpus(DogfoodRunInput(domain=d)) for d in ALL_DOMAINS}
    assert {r.corpus.value for r in reports.values()} == set(ALL_DOMAINS)
    assert sum(r.sources_attempted for r in reports.values()) == 25
    # ECONOMICS is an alias for the trade corpus.
    assert run_corpus(DogfoodRunInput(domain="ECONOMICS")).corpus.value == "TRADE"


def test_dry_run_health_domain_accepted():
    report = run_corpus(DogfoodRunInput(domain="HEALTH"))
    assert report.corpus.value == "HEALTH"
    assert all(r.domain.value == "HEALTH" for r in report.results)
    assert report.licence_outcomes.get("RESTRICTED") == 1


# ── 3. Live run outcomes ──────────────────────────────────────────────────────

def test_live_run_registers_source(monkeypatch):
    client = FakePipelineClient()
    report = _live(client, monkeypatch, [_seed()])
    result = report.results[0]
    assert client.calls == ["register_source"]
    assert result.source_id is not None
    # UNKNOWN licence: registered, then halted for licence review — never ingested.
    assert result.outcome == RunOutcome.ROUTED_TO_REVIEW
    assert result.stage_reached == "SOURCE_REGISTERED"


def test_live_run_records_ingestion_failure(monkeypatch):
    client = FakePipelineClient(fail={"ingest": RuntimeError("Layer 1 rejected .exe")})
    result = _live(client, monkeypatch, [_seed(**CLEAR)]).results[0]
    assert result.outcome == RunOutcome.FAILED_INGESTION
    assert result.stage_reached == "SOURCE_REGISTERED"
    assert "Layer 1 rejected" in result.error


def test_live_run_records_extraction_failure(monkeypatch):
    client = FakePipelineClient(extraction_passed=False)
    result = _live(client, monkeypatch, [_seed(**CLEAR)]).results[0]
    assert result.outcome == RunOutcome.FAILED_EXTRACTION
    assert result.stage_reached == "INGESTED"
    assert "provenance_map" in result.error
    assert "qualify" not in client.calls


def test_live_run_records_qualification_failure(monkeypatch):
    client = FakePipelineClient(fail={"qualify": ValueError("extraction not VALIDATED")})
    result = _live(client, monkeypatch, [_seed(**CLEAR)]).results[0]
    assert result.outcome == RunOutcome.FAILED_QUALIFICATION
    assert result.stage_reached == "EXTRACTED"
    assert "validate" not in client.calls


def test_live_run_records_routed_to_review(monkeypatch):
    client = FakePipelineClient(validation_outcome="REVIEW")
    report = _live(client, monkeypatch, [_seed(**CLEAR)])
    result = report.results[0]
    assert result.outcome == RunOutcome.ROUTED_TO_REVIEW
    assert result.stage_reached == "REVIEW"
    assert "create_dataset" not in client.calls
    assert report.sources_routed_to_review == 1


def test_live_run_records_licence_blocked(monkeypatch):
    client = FakePipelineClient()
    result = _live(client, monkeypatch, [_seed(licence_status="EXCLUDED")]).results[0]
    assert result.outcome == RunOutcome.LICENCE_BLOCKED
    assert result.source_id is None
    assert client.calls == []  # EXCLUDED is never even registered


def test_live_run_tracks_licence_outcomes_by_status(monkeypatch):
    seeds = [
        _seed(source_url="https://a.example.org/", licence_status="CLEAR"),
        _seed(source_url="https://b.example.org/", licence_status="UNKNOWN"),
        _seed(source_url="https://c.example.org/", licence_status="UNKNOWN"),
        _seed(source_url="https://d.example.org/", licence_status="EXCLUDED"),
        _seed(source_url="https://e.example.org/", licence_status="REVIEW_REQUIRED"),
    ]
    report = _live(FakePipelineClient(), monkeypatch, seeds)
    assert report.licence_outcomes == {"CLEAR": 1, "UNKNOWN": 2, "EXCLUDED": 1, "REVIEW_REQUIRED": 1}
    assert report.sources_routed_to_review == 3


def test_live_run_endpoint_generation_succeeds(monkeypatch):
    client = FakePipelineClient()
    seeds = [
        _seed(source_url="https://a.example.org/", **CLEAR),
        _seed(source_url="https://b.example.org/", licence_status="RESTRICTED"),
    ]
    report = _live(client, monkeypatch, seeds)
    assert [r.outcome for r in report.results] == [RunOutcome.SUCCESS, RunOutcome.SUCCESS]
    assert all(r.stage_reached == "ENDPOINT_GENERATED" for r in report.results)
    # Collection is created once per run, then reused.
    assert client.calls.count("get_or_create_collection") == 1
    assert client.calls.count("generate_endpoint") == 2
    # Stage 09 is a manual gate — the runner has no way to call it.
    assert not any(c.startswith(("approve", "publish", "register_x402")) for c in client.calls)


# ── 4. Run report ─────────────────────────────────────────────────────────────

def test_report_counts_match_results(monkeypatch):
    seeds = [
        _seed(source_url="https://a.example.org/", **CLEAR),
        _seed(source_url="https://b.example.org/", licence_status="UNKNOWN"),
        _seed(source_url="https://c.example.org/", licence_status="EXCLUDED"),
    ]
    report = _live(FakePipelineClient(), monkeypatch, seeds)
    assert report.sources_attempted == len(report.results) == 3
    assert (report.sources_succeeded, report.sources_failed, report.sources_routed_to_review) == (1, 1, 1)
    # The model refuses an inconsistent report.
    with pytest.raises(ValidationError):
        DogfoodRunReport.model_validate({**report.model_dump(), "sources_succeeded": 3})


def test_report_failure_modes_list_non_empty_on_failure(monkeypatch):
    client = FakePipelineClient(fail={"generate_endpoint": ValueError("dataset already has an endpoint")})
    report = _live(client, monkeypatch, [_seed(**CLEAR)])
    assert report.results[0].outcome == RunOutcome.FAILED_ENDPOINT
    assert len(report.failure_modes) == 1
    mode = report.failure_modes[0]
    assert set(mode) == {"source_url", "stage", "error"}
    assert mode["stage"] == "COLLECTION_LINKED"
    assert "already has an endpoint" in mode["error"]


def test_report_licence_outcomes_dict_populated():
    report = run_corpus(DogfoodRunInput(domain="TRADE"))
    assert report.licence_outcomes == {"REVIEW_REQUIRED": 1, "UNKNOWN": 3, "CLEAR": 1}
    assert sum(report.licence_outcomes.values()) == report.sources_attempted


def test_report_writes_to_db_when_flag_true(fake_db):
    report = run_corpus(DogfoodRunInput(domain="TOURISM", run_label="stage10-tourism-batch-1"), write_to_db=True)
    assert report.run_id is not None
    assert len(fake_db.dogfood_runs) == 1
    row = fake_db.dogfood_runs[0]
    assert row["run_id"] == str(report.run_id)
    assert row["corpus"] == "TOURISM" and row["domain"] == "ECONOMICS"
    assert row["dry_run"] is True and row["status"] == "COMPLETE"
    assert row["run_report"]["run_label"] == "stage10-tourism-batch-1"


def test_report_completed_at_set():
    report = run_corpus(DogfoodRunInput(domain="CLIMATE"))
    assert report.completed_at is not None
    assert report.completed_at >= report.started_at


def test_get_latest_run_returns_most_recent(fake_db):
    first = run_corpus(DogfoodRunInput(domain="HEALTH", run_label="health-1"), write_to_db=True)
    run_corpus(DogfoodRunInput(domain="FISHERIES", run_label="fish-1"), write_to_db=True)
    second = run_corpus(DogfoodRunInput(domain="HEALTH", run_label="health-2"), write_to_db=True)
    # Pin ordering: later started_at wins regardless of clock resolution.
    fake_db.dogfood_runs[0]["started_at"] = "2026-10-12T00:00:00+00:00"
    fake_db.dogfood_runs[1]["started_at"] = "2026-10-12T00:00:01+00:00"
    fake_db.dogfood_runs[2]["started_at"] = "2026-10-12T00:00:02+00:00"
    assert db.get_latest_run()["run_label"] == "health-2"
    assert db.get_latest_run("HEALTH")["run_id"] == str(second.run_id)
    assert db.get_latest_run("FISHERIES")["run_label"] == "fish-1"
    assert first.run_id != second.run_id
    assert "run_report" not in db.get_latest_run()


# ── 5. API routes ─────────────────────────────────────────────────────────────

def test_dogfood_run_requires_review_key(api):
    assert api.post("/dogfood/run", json={"domain": "FISHERIES"}).status_code == 401
    bad = api.post("/dogfood/run", json={"domain": "FISHERIES"}, headers={"X-PDQE-Review-Key": "wrong"})
    assert bad.status_code == 401
    assert api.get("/dogfood/report").status_code == 401


def test_dogfood_run_defaults_to_dry_run(api, fake_db):
    resp = api.post("/dogfood/run", json={"domain": "HEALTH"}, headers={"X-PDQE-Review-Key": API_KEY})
    assert resp.status_code == 200
    body = resp.json()
    assert body["dry_run"] is True
    assert body["sources_attempted"] == 5
    assert fake_db.dogfood_runs == []  # record_run defaults to false
    # A live run is refused until Stage 01/02 intake routes exist.
    live = api.post("/dogfood/run", json={"domain": "HEALTH", "dry_run": False}, headers={"X-PDQE-Review-Key": API_KEY})
    assert live.status_code == 501


def test_dogfood_report_returns_list(api):
    headers = {"X-PDQE-Review-Key": API_KEY}
    api.post("/dogfood/run", json={"domain": "TOURISM", "record_run": True}, headers=headers)
    api.post("/dogfood/run", json={"domain": "CLIMATE", "record_run": True}, headers=headers)
    resp = api.get("/dogfood/report", headers=headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list) and len(resp.json()) == 2
    tourism = api.get("/dogfood/report", params={"domain": "TOURISM", "limit": 5}, headers=headers).json()
    assert [r["corpus"] for r in tourism] == ["TOURISM"]


def test_dogfood_run_unknown_domain_returns_422(api):
    headers = {"X-PDQE-Review-Key": API_KEY}
    assert api.post("/dogfood/run", json={"domain": "ASTROLOGY"}, headers=headers).status_code == 422
    assert api.post("/dogfood/run", json={"domain": "FISHERIES", "surprise": 1}, headers=headers).status_code == 422
    assert api.get("/dogfood/report", params={"domain": "ASTROLOGY"}, headers=headers).status_code == 422
