"""
PDQE Stage 10 — Supabase client for pdqe.dogfood_runs.

Same service-role client factory as Stages 05–09. Rows read back are
validated through DogfoodRunSummary (P9) before they leave this module.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
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


# ── Stage 10.1 — live-run intake (Stage 01 registration, Stage 02 ingestion) ──

DOGFOOD_ACTOR_VERSION = "pdqe-stage10.1-dogfood"


def _rpc(name: str, params: dict, what: str) -> None:
    client = _get_client()
    try:
        client.schema("pdqe").rpc(name, params).execute()
    except APIError as exc:
        raise ValueError(f"{what} refused: {exc}") from exc


def insert_source(row: dict) -> str:
    """Insert a pdqe.sources row (lifecycle DISCOVERED) and return its source_id."""
    client = _get_client()
    try:
        response = client.schema("pdqe").table("sources").insert(row).execute()
    except APIError as exc:
        raise ValueError(f"Source {row.get('source_url')!r} could not be registered: {exc}") from exc
    if not response.data or not response.data[0].get("source_id"):
        raise ValueError(f"Source {row.get('source_url')!r} insert returned no source_id")
    return str(response.data[0]["source_id"])


def transition_source(source_id: str, state_to: str, rationale: str, input_hash: Optional[str] = None) -> None:
    """Advance a source via pdqe.transition_source_state (DB enforces the allowlist and licence rules)."""
    _rpc(
        "transition_source_state",
        {
            "p_source_id": source_id,
            "p_state_to": state_to,
            "p_actor_type": "DETERMINISTIC",
            "p_actor_version": DOGFOOD_ACTOR_VERSION,
            "p_rationale": rationale,
            "p_input_hash": input_hash,
        },
        f"Transition of source {source_id} to {state_to}",
    )


def insert_ingestion_event(row: dict) -> dict:
    """
    Insert a pdqe.ingestion_events row. The DB's Layer 1 trigger re-checks the
    file type and logs the result; the returned row carries layer1_passed.
    """
    client = _get_client()
    try:
        response = client.schema("pdqe").table("ingestion_events").insert(row).execute()
    except APIError as exc:
        raise ValueError(f"Ingestion event for source {row.get('source_id')} could not be recorded: {exc}") from exc
    if not response.data or not response.data[0].get("ingestion_id"):
        raise ValueError(f"Ingestion event for source {row.get('source_id')} returned no ingestion_id")
    return response.data[0]


def update_ingestion_event(ingestion_id: str, fields: dict) -> None:
    client = _get_client()
    try:
        client.schema("pdqe").table("ingestion_events").update(fields).eq("ingestion_id", ingestion_id).execute()
    except APIError as exc:
        raise ValueError(f"Ingestion event {ingestion_id} could not be updated: {exc}") from exc


def log_security_check(
    ingestion_id: str,
    layer: str,
    passed: bool,
    detail: dict,
    error_code: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    """Append to pdqe.upload_security_log via pdqe.log_security_check."""
    _rpc(
        "log_security_check",
        {
            "p_ingestion_id": ingestion_id,
            "p_layer": layer,
            "p_passed": passed,
            "p_detail": detail,
            "p_error_code": error_code,
            "p_error_message": error_message,
        },
        f"Security log for ingestion {ingestion_id} ({layer})",
    )


def set_source_content_hash(source_id: str, content_hash: str) -> None:
    """Record the Layer 2 canonical content hash (UNIQUE — refuses duplicate content)."""
    client = _get_client()
    try:
        client.schema("pdqe").table("sources").update(
            {"content_hash": content_hash, "accessed_at": datetime.now(timezone.utc).isoformat()}
        ).eq("source_id", source_id).execute()
    except APIError as exc:
        raise ValueError(f"Content hash for source {source_id} could not be recorded: {exc}") from exc


# ── Stage 10.1 — auto-approved source review queue ────────────────────────────

MAX_REVIEW_QUEUE_RUNS = 200


def list_live_run_reports(limit: int = MAX_REVIEW_QUEUE_RUNS) -> list[dict]:
    """Recent live (dry_run=false) runs with their full run_report, newest first."""
    client = _get_client()
    try:
        response = (
            client.schema("pdqe")
            .table("dogfood_runs")
            .select("run_id, run_label, started_at, run_report")
            .eq("dry_run", False)
            .order("started_at", desc=True)
            .limit(min(max(limit, 1), MAX_REVIEW_QUEUE_RUNS))
            .execute()
        )
    except APIError as exc:
        raise ValueError(f"Dogfood runs could not be listed: {exc}") from exc
    return response.data or []


def fetch_licence_confirmations(source_ids: list[str]) -> dict[str, Optional[str]]:
    """source_id → licence_confirmed_by (None = not yet confirmed by a human)."""
    if not source_ids:
        return {}
    client = _get_client()
    try:
        response = (
            client.schema("pdqe")
            .table("sources")
            .select("source_id, licence_confirmed_by")
            .in_("source_id", source_ids)
            .execute()
        )
    except APIError as exc:
        raise ValueError(f"Source licence confirmations could not be loaded: {exc}") from exc
    return {str(r["source_id"]): r.get("licence_confirmed_by") for r in response.data or []}
