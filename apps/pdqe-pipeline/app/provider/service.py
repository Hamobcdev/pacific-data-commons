"""
PDQE Stage 11 — external provider registration and source submission.

POST /provider/register  → register_provider
POST /ingest/submit      → submit_source

A submitted source stops at SOURCE_REGISTERED. Nothing here fetches the URL,
runs Layer 2+, or calls Claude/Jev: external sources need a human at SBP to
start Stage 02 from the review queue (P9, P12, Decision 58). The licence is
left UNKNOWN — a provider-supplied licence_url is recorded for that review,
not treated as confirmation ("Unknown is not approval").
"""

from __future__ import annotations

import logging
from urllib.parse import urlsplit
from uuid import UUID

from app.provider import supabase_client as db
from app.provider.errors import ProviderAPIError
from app.provider.schemas import (
    ProviderRegisterRequest,
    ProviderRegisterResponse,
    ProviderSourceSubmission,
    ProviderSourceSubmissionResponse,
    resolve_domain,
)
from app.security.layer1_whitelist import check_layer1

logger = logging.getLogger(__name__)

SUBMITTED_STATE = "SOURCE_REGISTERED"
SUBMITTED_MESSAGE = "Source registered. SBP will begin processing within 2 business days."

# Declared file type → pdqe.source_type. Anything Layer 1 permits but not
# listed here (docx, txt) is OTHER.
_SOURCE_TYPES = {
    "pdf": "PDF_DOCUMENT",
    "csv": "SPREADSHEET",
    "xlsx": "SPREADSHEET",
    "json": "API_ENDPOINT",
    "xml": "API_ENDPOINT",
}


def _db_error(action: str, exc: Exception) -> ProviderAPIError:
    # The DB message stays in the logs; the client gets a stable code only.
    logger.error("provider %s failed: %s", action, exc)
    return ProviderAPIError(500, "database_error", f"{action} failed; please retry later")


def register_provider(auth_user_id: UUID, request: ProviderRegisterRequest) -> ProviderRegisterResponse:
    """Create the caller's pdqe.provider_accounts row. 409 if one already exists."""
    conflict = ProviderAPIError(
        409, "provider_account_exists", "A provider account already exists for this user"
    )
    try:
        if db.get_provider_account(auth_user_id) is not None:
            raise conflict
        account_id = db.insert_provider_account(auth_user_id, request.verified_wallet)
    except db.DuplicateProviderAccount as exc:
        raise conflict from exc
    except ValueError as exc:
        raise _db_error("Provider registration", exc) from exc
    logger.info("provider registered: account=%s user=%s", account_id, auth_user_id)
    return ProviderRegisterResponse(provider_account_id=UUID(account_id))


def _active_account_id(auth_user_id: UUID) -> str:
    try:
        account = db.get_provider_account(auth_user_id)
    except ValueError as exc:
        raise _db_error("Provider account lookup", exc) from exc
    if account is None or account.get("is_active") is not True:
        raise ProviderAPIError(
            403, "no_active_provider_account", "No active provider account for this user"
        )
    return str(account["id"])


def submit_source(auth_user_id: UUID, submission: ProviderSourceSubmission) -> ProviderSourceSubmissionResponse:
    """
    Register an external source for the caller's provider account.

    Inserts pdqe.sources (internal_pipeline = false, tenant-scoped) and moves
    it DISCOVERED → SOURCE_REGISTERED through pdqe.transition_source_state,
    which writes the pipeline_state row. If that transition is refused the
    new row is removed, so no half-registered source is left behind.
    """
    domain = resolve_domain(submission.domain)

    if submission.file_type is not None:
        layer1 = check_layer1(submission.source_name, submission.file_type)
        if not layer1.passed:
            raise ProviderAPIError(
                400, "file_type_not_permitted", layer1.rejection_reason or "File type not permitted",
                field="file_type",
            )

    account_id = _active_account_id(auth_user_id)

    host = (urlsplit(submission.source_url).hostname or "").lower()
    row = {
        "title": submission.source_name,
        "description": submission.description,
        "publisher_name": host.removeprefix("www."),
        "source_url": submission.source_url,
        "source_type": _SOURCE_TYPES.get(submission.file_type or "", "OTHER"),
        "acquisition_method": "DIRECT_PROVISION",
        "licence_url": submission.licence_url,
        "candidate_domains": [domain.value],
        "registered_by": str(auth_user_id),
        "internal_pipeline": False,
        "provider_account_id": account_id,
    }
    try:
        source_id = db.insert_source(row)
    except ValueError as exc:
        raise _db_error("Source registration", exc) from exc
    try:
        db.transition_to_registered(source_id, auth_user_id)
    except ValueError as exc:
        db.delete_source(source_id)
        raise _db_error("Source registration", exc) from exc

    logger.info(
        "provider source submitted: source=%s account=%s domain=%s", source_id, account_id, domain.value
    )
    return ProviderSourceSubmissionResponse(
        source_id=UUID(source_id), lifecycle_state=SUBMITTED_STATE, message=SUBMITTED_MESSAGE
    )
