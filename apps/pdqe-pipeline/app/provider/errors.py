"""
PDQE Stage 11 — error shape for the external provider routes.

Provider routes are called by external clients, so errors carry a stable
machine-readable code at the top level ({"error": ..., "message": ...,
"field": ...}) rather than FastAPI's {"detail": ...}. The operator routes keep
their existing shape.
"""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse


class ProviderAPIError(Exception):
    """An error returned to an external provider with a stable error code."""

    def __init__(
        self,
        status_code: int,
        error: str,
        message: str,
        field: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error = error
        self.message = message
        self.field = field
        self.headers = headers


async def provider_api_error_handler(_request: Request, exc: ProviderAPIError) -> JSONResponse:
    body: dict[str, str] = {"error": exc.error, "message": exc.message}
    if exc.field is not None:
        body["field"] = exc.field
    return JSONResponse(status_code=exc.status_code, content=body, headers=exc.headers)
