"""
PDQE Stage 10.1 — idempotent resume in DirectPipelineClient.

Re-running a corpus must not crash on pdqe.sources' UNIQUE content_hash, and
must never skip Layer 2 for a source whose ingestion did not complete (P9).
Every Supabase call and pipeline function is replaced by an in-memory fake.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from postgrest import APIError

from app.dogfood import pipeline_client as pc
from app.dogfood import runner
from app.dogfood import supabase_client as db
from app.dogfood.fetcher import FetchResult
from app.dogfood.loader import load_corpus
from app.dogfood.pipeline_client import DirectPipelineClient
from app.dogfood.runner import run_corpus
from app.dogfood.schemas import DogfoodRunInput, RunOutcome, SeedSource
from app.security.layer2_sanitisation import Layer2Result

OPERATOR = UUID("00000000-0000-4000-8000-000000000001")
CONTENT = b"year,country,value\n2024,WSM,1\n"
CONTENT_HASH = hashlib.sha256(CONTENT).hexdigest()


def _seed(**overrides) -> SeedSource:
    seed = load_corpus("FISHERIES")[1]
    return SeedSource.model_validate({**seed.model_dump(mode="json"), "licence_status": "CLEAR", **overrides})


class _Fetcher:
    def __init__(self, content: bytes = CONTENT) -> None:
        self.content = content
        self.calls = 0

    def __call__(self, seed: SeedSource, tmp_dir: str) -> FetchResult:
        self.calls += 1
        path = Path(tmp_dir) / f"fetch-{uuid4().hex}.csv"
        path.write_bytes(self.content)
        return FetchResult(
            source_url=seed.source_url, local_path=str(path), content_type="text/csv",
            size_bytes=len(self.content), fetch_strategy="direct_download",
        )


class FakeDB:
    """In-memory pdqe.sources / ingestion_events / pipeline_state."""

    def __init__(self) -> None:
        self.sources: dict[str, dict] = {}
        self.events: dict[str, dict] = {}
        self.transitions: list[tuple[str, str, str]] = []
        self.layer2_calls = 0

    def add_source(self, url: str, state: str, content_hash: str | None = None, rationale: str | None = None) -> str:
        sid = str(uuid4())
        self.sources[sid] = {
            "source_id": sid, "source_url": url, "lifecycle_state": state,
            "content_hash": content_hash, "created_at": f"2026-10-0{len(self.sources) + 1}T00:00:00Z",
        }
        if rationale:
            self.transitions.append((sid, state, rationale))
        return sid

    def add_ready_ingestion(self, sid: str, content_hash: str) -> str:
        iid = str(uuid4())
        self.events[iid] = {"source_id": sid, "status": "LAYER3_PROMPT_READY", "content_hash": content_hash}
        return iid

    # ── supabase_client stand-ins ──
    def find_sources_by_url(self, url):
        rows = [dict(r) for r in self.sources.values() if r["source_url"] == url]
        return sorted(rows, key=lambda r: r["created_at"], reverse=True)

    def find_source_by_content_hash(self, content_hash):
        return next((dict(r) for r in self.sources.values() if r["content_hash"] == content_hash), None)

    def find_ready_ingestion(self, sid, content_hash):
        return next(
            (i for i, e in self.events.items()
             if e["source_id"] == sid and e["content_hash"] == content_hash and e["status"] == "LAYER3_PROMPT_READY"),
            None,
        )

    def latest_transition_rationale(self, sid, state):
        matches = [r for s, st, r in self.transitions if s == sid and st == state]
        return matches[-1] if matches else None

    def insert_source(self, row):
        return self.add_source(row["source_url"], "DISCOVERED")

    def transition_source(self, sid, state, rationale, input_hash=None):
        self.sources[sid]["lifecycle_state"] = state
        self.transitions.append((sid, state, rationale))

    def insert_ingestion_event(self, row):
        iid = str(uuid4())
        self.events[iid] = {"source_id": row["source_id"], "status": "RECEIVED", "content_hash": None}
        return {"ingestion_id": iid, "layer1_passed": True}

    def update_ingestion_event(self, iid, fields):
        self.events[iid].update(fields)

    def log_security_check(self, *args, **kwargs):
        pass

    def set_source_content_hash(self, sid, content_hash):
        owner = self.find_source_by_content_hash(content_hash)
        if owner is not None and owner["source_id"] != sid:
            raise db.DuplicateContentHash(sid, content_hash)
        self.sources[sid]["content_hash"] = content_hash


@pytest.fixture
def env(monkeypatch):
    monkeypatch.delenv("DOGFOOD_AUTO_APPROVE", raising=False)
    monkeypatch.delenv("PDQE_ENVIRONMENT", raising=False)
    fake = FakeDB()
    for name in (
        "find_sources_by_url", "find_source_by_content_hash", "find_ready_ingestion",
        "latest_transition_rationale", "insert_source", "transition_source", "insert_ingestion_event",
        "update_ingestion_event", "log_security_check", "set_source_content_hash",
    ):
        monkeypatch.setattr(pc.db, name, getattr(fake, name))

    extractions: list[dict] = []

    def _extract(**kwargs):
        extractions.append(kwargs)
        return SimpleNamespace(
            extraction_id=str(uuid4()), error=None,
            validation_result=SimpleNamespace(passed=True, rejection_reason=None),
        )

    async def _qualify(extraction_id):
        return SimpleNamespace(model_dump=lambda mode=None: {"routing_decision": "AUTO_APPROVE"})

    monkeypatch.setattr(pc, "run_extraction", _extract)
    monkeypatch.setattr(pc, "qualify", _qualify)
    monkeypatch.setattr(
        pc, "run_validation",
        lambda sid: SimpleNamespace(model_dump=lambda mode=None: {"outcome": "VALIDATED", "outcome_reason": "ok"}),
    )

    def _layer2(raw: bytes, ext: str) -> Layer2Result:
        fake.layer2_calls += 1
        return Layer2Result(passed=True, content_hash=hashlib.sha256(raw).hexdigest(), sanitised_content=raw)

    client = DirectPipelineClient(OPERATOR, layer2=_layer2)

    def run(seed: SeedSource, fetcher: _Fetcher):
        monkeypatch.setattr(runner, "load_corpus", lambda domain: [seed])
        return run_corpus(DogfoodRunInput(domain="FISHERIES", dry_run=False), client=client, fetcher=fetcher)

    return SimpleNamespace(db=fake, run=run, extractions=extractions, client=client)


# ── 1–5: required resume behaviours ───────────────────────────────────────────

def test_resume_skips_registration_when_already_ingested(env):
    """
    INGESTED earlier: no new pdqe.sources row and extraction resumes on the
    existing source. Sanitised content is never persisted, so the content is
    re-fetched and Layer 2 re-runs (never skipped) before extraction.
    """
    seed = _seed()
    sid = env.db.add_source(seed.source_url, "INGESTED", CONTENT_HASH)
    fetcher = _Fetcher()
    report = env.run(seed, fetcher)
    result = report.results[0]
    assert result.outcome == RunOutcome.ROUTED_TO_REVIEW  # validated; awaiting human approval
    assert result.source_id == UUID(sid)
    assert len(env.db.sources) == 1  # nothing new registered
    assert env.db.layer2_calls == 1 and fetcher.calls == 1
    assert env.extractions[0]["source_id"] == sid
    assert env.extractions[0]["sanitised_content"] == CONTENT.decode()
    # No INGESTED → INGESTED transition attempted on resume.
    assert [t for t in env.db.transitions if t[0] == sid and t[1] == "INGESTED"] == []


def test_resume_from_existing_content_hash_after_layer2(env):
    """Same content under a different URL: resume the source that owns the hash."""
    owner = env.db.add_source("https://other.example.org/mirror.csv", "INGESTED", CONTENT_HASH)
    owner_ingestion = env.db.add_ready_ingestion(owner, CONTENT_HASH)
    seed = _seed()
    report = env.run(seed, _Fetcher())  # must not raise
    result = report.results[0]
    assert result.outcome == RunOutcome.ROUTED_TO_REVIEW
    assert result.source_id == UUID(owner)
    assert env.db.layer2_calls == 1
    assert env.extractions[0]["source_id"] == owner
    assert env.extractions[0]["ingestion_id"] == owner_ingestion
    # This run's own registration is closed out as an audited duplicate.
    dup = next(s for s in env.db.sources.values() if s["source_url"] == seed.source_url)
    assert dup["lifecycle_state"] == "REJECTED" and dup["content_hash"] is None
    assert owner in env.db.latest_transition_rationale(dup["source_id"], "REJECTED")
    dup_events = [e for e in env.db.events.values() if e["source_id"] == dup["source_id"]]
    assert dup_events[0]["status"] == "REJECTED"
    # Next run: the URL now resolves to that rejected duplicate — skipped, no fetch.
    fetcher = _Fetcher()
    again = env.run(seed, fetcher).results[0]
    assert again.outcome == RunOutcome.SKIPPED_PREVIOUSLY_REJECTED and fetcher.calls == 0


@pytest.mark.parametrize("partial_state", ["DISCOVERED", "SOURCE_REGISTERED", "LICENSE_CHECKED"])
def test_registered_state_does_not_skip_layer2(env, partial_state):
    """
    P9 guard + claim-and-continue: a partial ingestion of the same URL is
    claimed (no new row), and fetch, Layer 1 and Layer 2 always run on it
    before extraction.
    """
    seed = _seed()
    partial = env.db.add_source(seed.source_url, partial_state)
    fetcher = _Fetcher()
    result = env.run(seed, fetcher).results[0]
    assert fetcher.calls == 1
    assert env.db.layer2_calls == 1
    assert result.outcome == RunOutcome.ROUTED_TO_REVIEW  # validated; awaiting human approval
    assert result.source_id == UUID(partial)
    assert len(env.db.sources) == 1  # claimed, not re-registered
    assert env.db.sources[partial]["lifecycle_state"] == "INGESTED"
    assert env.db.sources[partial]["content_hash"] == CONTENT_HASH
    assert env.extractions[0]["source_id"] == partial
    # Missing Stage 01 transitions are re-walked in order before INGESTED.
    walked = [t[1] for t in env.db.transitions if t[0] == partial]
    assert walked == {
        "DISCOVERED": ["SOURCE_REGISTERED", "LICENSE_CHECKED", "INGESTED"],
        "SOURCE_REGISTERED": ["LICENSE_CHECKED", "INGESTED"],
        "LICENSE_CHECKED": ["INGESTED"],
    }[partial_state]


def test_partial_with_matching_hash_is_claimed(env):
    """A partial that recorded a hash before failing: the fresh Layer 2 hash confirms it."""
    seed = _seed()
    partial = env.db.add_source(seed.source_url, "LICENSE_CHECKED", CONTENT_HASH)
    result = env.run(seed, _Fetcher()).results[0]
    assert result.source_id == UUID(partial)
    assert env.db.layer2_calls == 1
    assert env.db.sources[partial]["lifecycle_state"] == "INGESTED"
    assert env.extractions[0]["source_id"] == partial


def test_partial_with_changed_content_returns_content_changed(env):
    seed = _seed()
    partial = env.db.add_source(seed.source_url, "LICENSE_CHECKED", CONTENT_HASH)
    report = env.run(seed, _Fetcher(content=b"year,country,value\n2025,WSM,2\n"))
    result = report.results[0]
    assert result.outcome == RunOutcome.CONTENT_CHANGED
    assert result.source_id == UUID(partial)
    assert "declared dataset update" in result.error
    assert env.db.layer2_calls == 1 and env.extractions == []
    assert env.db.sources[partial]["lifecycle_state"] == "LICENSE_CHECKED"  # not advanced
    assert env.db.sources[partial]["content_hash"] == CONTENT_HASH  # not overwritten
    assert report.sources_routed_to_review == 1 and report.sources_failed == 0


def test_duplicate_hash_retry_of_same_url_claims_partial_owner(env, tmp_path):
    """
    content_hash path: this run's new row collides with a partial of the same
    URL (a retry). The partial is claimed and Layer 2 re-runs on it.
    """
    seed = _seed()
    owner = env.db.add_source(seed.source_url, "LICENSE_CHECKED", CONTENT_HASH)
    dup = env.db.insert_source({"source_url": seed.source_url})
    for state in ("SOURCE_REGISTERED", "LICENSE_CHECKED"):
        env.db.transition_source(dup, state, "test registration")
    response = env.client.ingest(UUID(dup), seed, _Fetcher()(seed, str(tmp_path)))  # must not raise
    assert response["resume"] == "CLAIM_PARTIAL" and response["source_id"] == owner
    assert env.db.layer2_calls == 2  # this run's Layer 2 + the claimed row's own Layer 2
    assert env.db.sources[owner]["lifecycle_state"] == "INGESTED"
    assert env.db.sources[dup]["lifecycle_state"] == "REJECTED"
    owner_events = [e for e in env.db.events.values() if e["source_id"] == owner]
    assert owner_events[-1]["status"] == "LAYER3_PROMPT_READY"


def test_partial_owner_from_other_url_returns_already_processed(env):
    """content_hash path: identical content from a different URL is genuine dedup."""
    seed = _seed()
    owner = env.db.add_source("https://other.example.org/mirror.csv", "LICENSE_CHECKED", CONTENT_HASH)
    report = env.run(seed, _Fetcher())
    result = report.results[0]
    assert result.outcome == RunOutcome.ALREADY_PROCESSED
    assert result.source_id == UUID(owner)
    assert "other.example.org" in result.error
    assert env.extractions == []
    assert env.db.sources[owner]["lifecycle_state"] == "LICENSE_CHECKED"  # owner untouched
    dup = next(s for s in env.db.sources.values() if s["source_url"] == seed.source_url)
    assert dup["lifecycle_state"] == "REJECTED"
    assert report.sources_already_processed == 1 and report.sources_failed == 0


def test_no_manual_cleanup_paths_remain():
    assert "manual cleanup" not in Path(pc.__file__).read_text()


def test_previously_rejected_source_returns_skipped(env):
    seed = _seed()
    sid = env.db.add_source(seed.source_url, "REJECTED", CONTENT_HASH, rationale="licence withdrawn by publisher")
    fetcher = _Fetcher()
    report = env.run(seed, fetcher)
    result = report.results[0]
    assert result.outcome == RunOutcome.SKIPPED_PREVIOUSLY_REJECTED
    assert result.source_id == UUID(sid)
    assert "licence withdrawn by publisher" in result.error
    assert fetcher.calls == 0 and env.db.layer2_calls == 0 and len(env.db.sources) == 1
    assert report.sources_skipped_previously_rejected == 1
    assert (report.sources_succeeded, report.sources_failed, report.sources_routed_to_review) == (0, 0, 0)
    assert report.failure_modes == []


def test_already_extracted_returns_already_processed(env):
    seed = _seed()
    sid = env.db.add_source(seed.source_url, "EXTRACTED", CONTENT_HASH)
    # An older partial registration of the same URL does not outrank it.
    env.db.add_source(seed.source_url, "LICENSE_CHECKED")
    fetcher = _Fetcher()
    report = env.run(seed, fetcher)
    result = report.results[0]
    assert result.outcome == RunOutcome.ALREADY_PROCESSED
    assert result.source_id == UUID(sid) and result.stage_reached == "EXTRACTED"
    assert fetcher.calls == 0 and env.db.layer2_calls == 0 and env.extractions == []
    assert report.sources_already_processed == 1
    assert (report.sources_succeeded, report.sources_failed, report.sources_routed_to_review) == (0, 0, 0)


# ── Supporting behaviour ──────────────────────────────────────────────────────

def test_resume_refuses_changed_upstream_content(env):
    seed = _seed()
    sid = env.db.add_source(seed.source_url, "INGESTED", CONTENT_HASH)
    result = env.run(seed, _Fetcher(content=b"year,country,value\n2025,WSM,2\n")).results[0]
    assert result.outcome == RunOutcome.CONTENT_CHANGED
    assert result.source_id == UUID(sid)
    assert "upstream content changed" in result.error
    assert env.extractions == []


def test_set_source_content_hash_maps_unique_violation(monkeypatch):
    class _Table:
        def __init__(self, code):
            self.code = code

        def update(self, fields):
            return self

        def eq(self, *args):
            return self

        def execute(self):
            raise APIError({"code": self.code, "message": "boom"})

    for code, expected in (("23505", db.DuplicateContentHash), ("42501", ValueError)):
        table = _Table(code)
        client = SimpleNamespace(schema=lambda name: SimpleNamespace(table=lambda t: table))
        monkeypatch.setattr(db, "_get_client", lambda: client)
        with pytest.raises(expected) as info:
            db.set_source_content_hash("sid", "hash")
        if code != "23505":
            assert not isinstance(info.value, db.DuplicateContentHash)
