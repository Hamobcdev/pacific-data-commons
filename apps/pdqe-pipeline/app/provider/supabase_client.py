"""
PDQE Stage 11 — Supabase access for the external provider routes.

Service-role client (same factory as Stages 05–10). The service role bypasses
RLS, so every query here is scoped explicitly by the authenticated
auth_user_id passed in from the route — never by a value from the request
body.
"""

from __future__ import annotations

import logging
from uuid import UUID

from postgrest import APIError

from app.validation.supabase_client import _get_client

logger = logging.getLogger(__name__)

PROVIDER_ACTOR_VERSION = "pdqe-stage11-provider-submit"

_UNIQUE_VIOLATION = "23505"
_ACCOUNT_COLUMNS = "id, auth_user_id, is_active"


class DuplicateProviderAccount(Exception):
    """The auth user already has a pdqe.provider_accounts row."""


def get_provider_account(auth_user_id: UUID) -> dict | None:
    """The caller's pdqe.provider_accounts row, or None."""
    try:
        response = (
            _get_client()
            .schema("pdqe")
            .table("provider_accounts")
            .select(_ACCOUNT_COLUMNS)
            .eq("auth_user_id", str(auth_user_id))
            .limit(1)
            .execute()
        )
    except APIError as exc:
        raise ValueError(f"Provider account lookup failed: {exc}") from exc
    rows = response.data or []
    return rows[0] if rows else None


def insert_provider_account(auth_user_id: UUID, verified_wallet: str) -> str:
    """
    Insert a standard, active provider account and return its id.

    provider_id is left NULL: SBP links the PDC provider listing after Bronze
    verification. Raises DuplicateProviderAccount on the auth_user_id UNIQUE
    constraint, so a race between two registrations still yields one 409.
    """
    row = {
        "auth_user_id": str(auth_user_id),
        "verified_wallet": verified_wallet,
        "plan": "standard",
        "is_active": True,
    }
    try:
        response = _get_client().schema("pdqe").table("provider_accounts").insert(row).execute()
    except APIError as exc:
        if exc.code == _UNIQUE_VIOLATION:
            raise DuplicateProviderAccount(str(auth_user_id)) from exc
        raise ValueError(f"Provider account could not be created: {exc}") from exc
    if not response.data or not response.data[0].get("id"):
        raise ValueError("Provider account insert returned no id")
    return str(response.data[0]["id"])


def insert_source(row: dict) -> str:
    """Insert a pdqe.sources row (lifecycle DISCOVERED) and return its source_id."""
    try:
        response = _get_client().schema("pdqe").table("sources").insert(row).execute()
    except APIError as exc:
        raise ValueError(f"Source could not be registered: {exc}") from exc
    if not response.data or not response.data[0].get("source_id"):
        raise ValueError("Source insert returned no source_id")
    return str(response.data[0]["source_id"])


def transition_to_registered(source_id: str, auth_user_id: UUID) -> None:
    """
    DISCOVERED → SOURCE_REGISTERED via pdqe.transition_source_state, which
    writes the pdqe.pipeline_state row and enforces the transition allowlist.
    The actor is the submitting provider (HUMAN, actor_user_id set).
    """
    try:
        _get_client().schema("pdqe").rpc(
            "transition_source_state",
            {
                "p_source_id": source_id,
                "p_state_to": "SOURCE_REGISTERED",
                "p_actor_type": "HUMAN",
                "p_actor_version": PROVIDER_ACTOR_VERSION,
                "p_actor_user_id": str(auth_user_id),
                "p_rationale": "Stage 11 external provider submission via POST /ingest/submit",
            },
        ).execute()
    except APIError as exc:
        raise ValueError(f"Transition of source {source_id} to SOURCE_REGISTERED refused: {exc}") from exc


def delete_source(source_id: str) -> None:
    """
    Compensating delete for a source whose registration transition failed, so
    a half-registered DISCOVERED row is not left behind. Best effort: a
    failure is logged, not raised, so the original error is what surfaces.
    """
    try:
        _get_client().schema("pdqe").table("sources").delete().eq("source_id", source_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.error("provider submit: could not remove orphaned source %s: %s", source_id, exc)
