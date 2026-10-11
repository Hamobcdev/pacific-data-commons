"""
PDQE Stage 10.1 — Corpus fetcher.

Downloads content from a seed source URL for a live corpus run.

Design rules:
- Never called in dry_run=True mode (the runner only calls it on live runs)
- Content is downloaded at runtime only; nothing fetched is ever committed
- Downloads to a temp file in the caller's tmp_dir; the caller deletes it
  (a partial file is deleted here before FetchError is raised)
- Timeout: 30s connect, 60s read
- Max content size: 50MB, enforced while streaming (FetchError if exceeded)
- licence_status EXCLUDED raises FetchError before any network call
- Every failure is a FetchError — raw httpx exceptions never propagate

P9: everything about the response (status, headers, body, redirect target) is
untrusted. The declared Content-Type is checked against an allowlist; Layer 1
and Layer 2 still run on the bytes downstream before anything reaches Claude.
"""

from __future__ import annotations

import logging
import os
import tempfile
from urllib.parse import urlsplit, urlunsplit

import httpx
from pydantic import BaseModel, ConfigDict

from app.dogfood.schemas import SeedSource
from app.review.schemas import LicenceStatus

logger = logging.getLogger(__name__)

MAX_CONTENT_BYTES = 50 * 1024 * 1024
FETCH_TIMEOUT = httpx.Timeout(connect=30.0, read=60.0, write=30.0, pool=30.0)
MAX_REDIRECTS = 5
_CHUNK_BYTES = 64 * 1024
_USER_AGENT = "PDQE-dogfood/0.10.1 (+https://pdc.synergybcpacific.com)"

ALLOWED_CONTENT_TYPES = {
    "text/csv",
    "application/json",
    "application/xml",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/pdf",
    "text/plain",
}

# Equivalent MIME spellings servers commonly send → canonical allowlisted type.
# .Stat Suite (PDH.stat) serves SDMX-CSV as application/vnd.sdmx.data+csv.
_CONTENT_TYPE_ALIASES = {
    "application/vnd.sdmx.data+csv": "text/csv",
    "application/csv": "text/csv",
    "text/xml": "application/xml",
}

STRATEGY_DIRECT = "direct_download"
STRATEGY_SDMX = "sdmx_api"
STRATEGY_ODATA = "odata_api"

_SDMX_HOST = "stats-nsi-stable.pacificdata.org"
_ODATA_HOST = "ghoapi.azureedge.net"


class FetchError(Exception):
    """Raised when a source cannot be fetched."""


class FetchResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_url: str
    local_path: str  # temp file path; caller must delete
    content_type: str  # canonical MIME type (parameters stripped)
    size_bytes: int
    fetch_strategy: str  # "direct_download" | "sdmx_api" | "odata_api"


def select_strategy(url: str) -> str:
    """Pick the fetch strategy from the URL host (and path for OData)."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if host == _SDMX_HOST:
        return STRATEGY_SDMX
    if host == _ODATA_HOST and parts.path.startswith("/api"):
        return STRATEGY_ODATA
    return STRATEGY_DIRECT


def build_fetch_url(url: str, strategy: str) -> str:
    """
    Rewrite the URL for its strategy:
    - sdmx_api: request CSV (format=csv) unless a format is already given
    - odata_api: request JSON, first 1000 rows, only when there is no query string
    - direct_download: unchanged
    """
    parts = urlsplit(url)
    if strategy == STRATEGY_SDMX:
        params = [p.split("=", 1)[0].lower() for p in parts.query.split("&") if p]
        if "format" in params:
            return url
        query = f"{parts.query}&format=csv" if parts.query else "format=csv"
        return urlunsplit(parts._replace(query=query))
    if strategy == STRATEGY_ODATA and not parts.query:
        return urlunsplit(parts._replace(query="$format=json&$top=1000"))
    return url


def _canonical_content_type(header: str | None) -> str:
    mime = (header or "").split(";", 1)[0].strip().lower()
    return _CONTENT_TYPE_ALIASES.get(mime, mime)


def _check_redirect_target(response: httpx.Response) -> None:
    """Refuse a redirect chain that ends on a non-http(s) URL."""
    if response.url.scheme not in ("http", "https"):
        raise FetchError(f"redirected to a non-http(s) URL scheme: {response.url.scheme!r}")


def fetch_source(seed: SeedSource, tmp_dir: str) -> FetchResult:
    """
    Download content from seed.source_url to a temp file in tmp_dir.

    Raises FetchError if:
    - licence_status is EXCLUDED (before any network call)
    - HTTP error (4xx/5xx), timeout, or any transport error
    - Content > 50MB (declared Content-Length or bytes actually streamed)
    - Content-Type is not in ALLOWED_CONTENT_TYPES
    """
    if seed.licence_status == LicenceStatus.EXCLUDED:
        raise FetchError(f"licence_status EXCLUDED — {seed.source_url} must never be fetched")

    strategy = select_strategy(seed.source_url)
    url = build_fetch_url(seed.source_url, strategy)

    fd, local_path = tempfile.mkstemp(prefix="pdqe-dogfood-", dir=tmp_dir)
    size = 0
    try:
        with os.fdopen(fd, "wb") as out, httpx.Client(
            timeout=FETCH_TIMEOUT,
            follow_redirects=True,
            max_redirects=MAX_REDIRECTS,
            headers={"User-Agent": _USER_AGENT},
        ) as client, client.stream("GET", url) as response:
            _check_redirect_target(response)
            if response.status_code >= 400:
                raise FetchError(f"HTTP {response.status_code} fetching {url}")

            content_type = _canonical_content_type(response.headers.get("content-type"))
            if content_type not in ALLOWED_CONTENT_TYPES:
                raise FetchError(
                    f"content type {content_type or '(none)'!r} from {url} is not allowed"
                )

            declared = response.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > MAX_CONTENT_BYTES:
                raise FetchError(f"declared size {declared} bytes exceeds {MAX_CONTENT_BYTES}")

            for chunk in response.iter_bytes(_CHUNK_BYTES):
                size += len(chunk)
                if size > MAX_CONTENT_BYTES:
                    raise FetchError(f"content from {url} exceeds {MAX_CONTENT_BYTES} bytes")
                out.write(chunk)

        if size == 0:
            raise FetchError(f"empty response body from {url}")
    except FetchError:
        _remove(local_path)
        raise
    except httpx.TimeoutException as exc:
        _remove(local_path)
        raise FetchError(f"timeout fetching {url}: {type(exc).__name__}") from exc
    except httpx.HTTPError as exc:
        _remove(local_path)
        raise FetchError(f"transport error fetching {url}: {type(exc).__name__}: {exc}") from exc
    except OSError as exc:
        _remove(local_path)
        raise FetchError(f"could not write fetched content for {url}: {exc}") from exc

    logger.info("dogfood fetch: %s → %s (%d bytes, %s)", url, content_type, size, strategy)
    return FetchResult(
        source_url=seed.source_url,
        local_path=local_path,
        content_type=content_type,
        size_bytes=size,
        fetch_strategy=strategy,
    )


def _remove(path: str) -> None:
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass
    except OSError as exc:  # noqa: BLE001 — cleanup failure is logged, not raised
        logger.warning("dogfood fetch: could not delete temp file %s: %s", path, exc)
