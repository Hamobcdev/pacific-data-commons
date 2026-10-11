"""
PDQE Stage 10 — Supabase client for pdqe.dogfood_runs.

Same service-role client factory as Stages 05–09. Rows read back are
validated through DogfoodRunSummary (P9) before they leave this module.
"""

from __future__ import annotations

import logging
from typing import Optional

from postgrest import APIError
from pydantic import ValidationError

from app.dogfood.schemas import (
    CORPUS_PRIMARY_DOMAIN,
    DogfoodRunReport,
    DogfoodRunSummary,
    resolve_corpus,
)
from app.validation.supabase_client import _get_client

logger = logging.getLogger(__name__)

MAX_REPORT_PAGE = 50

_SUMMARY_COLUMNS = (
    "run_id, run_label, corpus, domain, dry_run, sources_attempted, sources_succeeded, "
    "sources_failed, sources_routed_to_review, failure_modes, licence_outcomes, "
    "started_at, completed_at, status"
)


def write_run_report(report: DogfoodRunReport, dry_run: bool) -> str:
    """Insert a completed run into pdqe.dogfood_runs and return its run_id."""
    row = {
        "run_label": report.run_label,
        "corpus": report.corpus.value,
        "domain": CORPUS_PRIMARY_DOMAIN[report.corpus].value,
        "dry_run": dry_run,
        "sources_attempted": report.sources_attempted,
        "sources_succeeded": report.sources_succeeded,
        "sources_failed": report.sources_failed,
        "sources_routed_to_review": report.sources_routed_to_review,
        "failure_modes": report.failure_modes,
        "licence_outcomes": report.licence_outcomes,
        "run_report": report.model_dump(mode="json"),
        "started_at": report.started_at.isoformat(),
        "completed_at": (report.completed_at or report.started_at).isoformat(),
        "status": "COMPLETE",
    }
    client = _get_client()
    try:
        response = client.schema("pdqe").table("dogfood_runs").insert(row).execute()
    except APIError as exc:
        raise ValueError(f"Dogfood run {report.run_label!r} could not be recorded: {exc}") from exc
    if not response.data or not response.data[0].get("run_id"):
        raise ValueError(f"Dogfood run {report.run_label!r} insert returned no run_id")
    run_id = str(response.data[0]["run_id"])
    logger.info("dogfood run recorded: %s (%s)", run_id, report.run_label)
    return run_id


def list_runs(corpus: Optional[str] = None, limit: int = 5) -> list[dict]:
    """Recent run summaries, newest first, optionally for one corpus."""
    client = _get_client()
    query = client.schema("pdqe").table("dogfood_runs").select(_SUMMARY_COLUMNS)
    if corpus is not None:
        query = query.eq("corpus", corpus)
    try:
        response = query.order("started_at", desc=True).limit(min(max(limit, 1), MAX_REPORT_PAGE)).execute()
    except APIError as exc:
        raise ValueError(f"Dogfood runs could not be listed: {exc}") from exc
    summaries: list[dict] = []
    for row in response.data or []:
        try:
            summaries.append(DogfoodRunSummary.model_validate(row).model_dump(mode="json"))
        except ValidationError as exc:
            raise ValueError(f"pdqe.dogfood_runs row failed validation: {exc}") from exc
    return summaries


def get_latest_run(domain: Optional[str] = None) -> dict:
    """The most recent run summary (optionally for one corpus), or {} if none exist."""
    corpus = resolve_corpus(domain).value if domain is not None else None
    runs = list_runs(corpus, limit=1)
    return runs[0] if runs else {}
