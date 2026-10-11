"""
PDQE Stage 11 — request/response schemas for the external provider routes.

Everything an external provider sends is untrusted input (P9, P12): every
model is extra="forbid", strings are length-bounded, and URLs are checked
before anything reaches Supabase. A Pydantic failure is reported as HTTP 400
naming the offending field (see parse_body); an unknown domain is a separate
HTTP 422 (see resolve_domain), so a client can tell "malformed request" from
"valid request for a domain PDQE does not handle".
"""

from __future__ import annotations

import ipaddress
from typing import Any, TypeVar
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.endpoint.schemas import ALGORAND_ADDRESS_PATTERN
from app.provider.errors import ProviderAPIError
from app.qualification.schemas import DomainClassification

MAX_URL_LENGTH = 2048
MAX_SOURCE_NAME_LENGTH = 300
MAX_DESCRIPTION_LENGTH = 5000
MAX_FILE_TYPE_LENGTH = 16

# Hostnames that only ever resolve inside an operator's own network. SBP will
# later fetch source_url server-side, so a submission must not be able to
# point that fetch at internal infrastructure.
_INTERNAL_HOST_SUFFIXES = (".localhost", ".local", ".internal", ".lan", ".home.arpa")


# ── Body parsing ───────────────────────────────────────────────────────────────

_ModelT = TypeVar("_ModelT", bound=BaseModel)


def parse_body(model: type[_ModelT], payload: Any) -> _ModelT:
    """Validate a JSON body against `model`; any failure is HTTP 400 naming the field."""
    if not isinstance(payload, dict):
        raise ProviderAPIError(400, "validation_error", "Request body must be a JSON object")
    try:
        return model.model_validate(payload)
    except ValidationError as exc:
        first = exc.errors()[0]
        field = ".".join(str(part) for part in first.get("loc", ())) or None
        if first.get("type") == "missing":
            message = f"{field} is required"
        elif first.get("type") == "extra_forbidden":
            message = f"{field} is not a recognised field"
        else:
            message = f"{field}: {first.get('msg', 'invalid value')}"
        raise ProviderAPIError(400, "validation_error", message, field=field) from exc


def _check_url(value: str, *, https_only: bool) -> str:
    if len(value) > MAX_URL_LENGTH:
        raise ValueError(f"must be at most {MAX_URL_LENGTH} characters")
    parts = urlsplit(value)
    allowed = ("https",) if https_only else ("https", "http")
    if parts.scheme.lower() not in allowed:
        raise ValueError("must start with https://" if https_only else "must be an http(s) URL")
    if parts.username is not None or parts.password is not None:
        raise ValueError("must not contain credentials")
    host = (parts.hostname or "").rstrip(".").lower()
    if not host:
        raise ValueError("must include a host name")
    if "." not in host or host == "localhost" or host.endswith(_INTERNAL_HOST_SUFFIXES):
        raise ValueError("must be a publicly reachable host")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None and not ip.is_global:
        raise ValueError("must be a publicly reachable host")
    return value


# ── POST /provider/register ────────────────────────────────────────────────────

class ProviderRegisterRequest(BaseModel):
    """Body for POST /provider/register."""

    model_config = ConfigDict(extra="forbid")

    # Same pattern as the pdqe.provider_accounts CHECK. Not normalised: an
    # Algorand address is upper-case base32, so a lower-case value is wrong,
    # not a formatting variant.
    verified_wallet: str = Field(pattern=ALGORAND_ADDRESS_PATTERN)


class ProviderRegisterResponse(BaseModel):
    provider_account_id: UUID
    status: str = "registered"


# ── POST /ingest/submit ────────────────────────────────────────────────────────

class ProviderSourceSubmission(BaseModel):
    """Body for POST /ingest/submit."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    # pdqe.sources.title CHECK: at least 3 non-blank characters.
    source_name: str = Field(min_length=3, max_length=MAX_SOURCE_NAME_LENGTH)
    source_url: str
    # Presence/type only here; membership is checked by resolve_domain → 422.
    domain: str = Field(min_length=1, max_length=64)
    licence_url: str | None = None
    description: str | None = Field(default=None, max_length=MAX_DESCRIPTION_LENGTH)
    file_type: str | None = Field(default=None, min_length=1, max_length=MAX_FILE_TYPE_LENGTH)

    @field_validator("source_url")
    @classmethod
    def _source_url_https(cls, value: str) -> str:
        return _check_url(value, https_only=True)

    @field_validator("licence_url")
    @classmethod
    def _licence_url(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        return _check_url(value, https_only=False)

    @field_validator("description")
    @classmethod
    def _blank_description(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("file_type")
    @classmethod
    def _normalise_file_type(cls, value: str | None) -> str | None:
        # "CSV", ".csv" and "csv" are the same declaration.
        return None if value is None else value.lstrip(".").lower()


def resolve_domain(value: str) -> DomainClassification:
    """
    Map a submitted domain to DomainClassification (case-insensitive), or
    raise HTTP 422. NONE_OF_THE_ABOVE maps to OTHER — the same rule as the
    Jev→DB boundary, since pdqe.source_domain has no NONE_OF_THE_ABOVE.
    """
    try:
        domain = DomainClassification(value.strip().upper())
    except ValueError as exc:
        valid = ", ".join(d.value for d in DomainClassification)
        raise ProviderAPIError(
            422, "invalid_domain", f"domain must be one of: {valid}", field="domain"
        ) from exc
    return DomainClassification.OTHER if domain is DomainClassification.NONE_OF_THE_ABOVE else domain


class ProviderSourceSubmissionResponse(BaseModel):
    source_id: UUID
    lifecycle_state: str
    message: str
