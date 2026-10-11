"""
PDQE Stage 11 — Supabase JWT authentication for external provider routes.

The provider routes are the first pipeline routes called by external users
rather than SBP operators, so they authenticate with the caller's own
Supabase session (Authorization: Bearer <access token>) instead of the shared
X-PDQE-Review-Key.

The token is verified by Supabase Auth itself (GET /auth/v1/user via the
service-role client), not by decoding it locally: that checks signature,
expiry and that the user still exists, with no JWT secret held by this
service. Fails closed — any doubt is a 401, an unreachable auth service is a
503, never an unauthenticated pass.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import UUID

from fastapi import Header
from supabase_auth.errors import AuthApiError

from app.provider.errors import ProviderAPIError
from app.validation.supabase_client import _get_client

logger = logging.getLogger(__name__)

_BEARER_PREFIX = "bearer "


@dataclass(frozen=True)
class AuthenticatedUser:
    """The verified Supabase auth user behind a provider request."""

    user_id: UUID


def _unauthorised(message: str) -> ProviderAPIError:
    return ProviderAPIError(401, "unauthorized", message, headers={"WWW-Authenticate": "Bearer"})


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise _unauthorised("Missing Authorization header")
    if authorization[: len(_BEARER_PREFIX)].lower() != _BEARER_PREFIX:
        raise _unauthorised("Authorization header must use the Bearer scheme")
    token = authorization[len(_BEARER_PREFIX):].strip()
    if not token:
        raise _unauthorised("Missing bearer token")
    return token


def verify_supabase_jwt(token: str) -> AuthenticatedUser:
    """
    Resolve an access token to its Supabase auth user.

    Raises ProviderAPIError 401 if Supabase rejects the token or the user is
    anonymous, 503 if the auth service cannot be reached or is not
    configured.
    """
    try:
        response = _get_client().auth.get_user(token)
    except AuthApiError as exc:
        status = getattr(exc, "status", None)
        if isinstance(status, int) and status >= 500:
            # Supabase Auth failed, not the token — don't tell the caller to re-login.
            logger.error("provider auth: Supabase Auth error %s: %s", status, exc)
            raise ProviderAPIError(503, "auth_unavailable", "Authentication service unavailable") from exc
        logger.info("provider auth: token rejected by Supabase (%s)", status)
        raise _unauthorised("Invalid or expired token") from exc
    except RuntimeError as exc:
        # _get_client raises RuntimeError when SUPABASE_URL / key are unset.
        logger.error("provider auth: Supabase not configured: %s", exc)
        raise ProviderAPIError(503, "auth_unavailable", "Authentication is not configured") from exc
    except Exception as exc:  # noqa: BLE001
        logger.error("provider auth: token verification failed: %s", exc)
        raise ProviderAPIError(503, "auth_unavailable", "Authentication service unavailable") from exc

    user = getattr(response, "user", None)
    if user is None or not getattr(user, "id", None):
        raise _unauthorised("Invalid or expired token")
    if getattr(user, "is_anonymous", False):
        # Anonymous Supabase sessions have no identity to hold accountable
        # (Decision 58) — they cannot own a provider account.
        raise _unauthorised("Anonymous sessions cannot act as a provider")
    try:
        return AuthenticatedUser(user_id=UUID(str(user.id)))
    except ValueError as exc:
        raise _unauthorised("Invalid or expired token") from exc


def require_supabase_user(authorization: str | None = Header(default=None)) -> AuthenticatedUser:
    """FastAPI dependency: the verified caller, or HTTP 401/503."""
    return verify_supabase_jwt(_extract_bearer_token(authorization))
