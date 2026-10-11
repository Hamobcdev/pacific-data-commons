"""
PDQE Stage 02b — Layer 2: Content sanitisation.

Strips executable code, macros, embedded scripts, and all metadata before
any content reaches Layer 3. Files are treated as untrusted data (Decision 58,
P9, P12): Layer 1 has only checked the declared file type, so every byte here
may be adversarial.

Every accepted type is reduced to plain UTF-8 text (or re-serialised JSON/XML
text) — nothing in a binary container format survives:

  csv   decode (UTF-8, latin-1 fallback) → formula-injection guard → CSV text
  json  strict parse → canonical re-serialisation (sorted keys, no whitespace)
  txt   decode (UTF-8, latin-1 fallback) → null bytes stripped
  xml   defusedxml parse (blocks XXE, entity expansion) → re-serialised;
        comments, processing instructions and the DOCTYPE are dropped
  xlsx  openpyxl data_only + read_only (cached values only — formulae, VBA,
        embedded objects and pivot caches are never read) → CSV text per sheet
  docx  python-docx paragraph and table text only → plain text
  pdf   pypdf text extraction per page (metadata, annotations, JavaScript and
        embedded files are never read) → plain text; encrypted PDFs rejected

content_hash is the SHA-256 of the sanitised bytes — the deduplication key for
pdqe.sources.content_hash (UNIQUE). It is never the hash of the raw input.

run_layer2() never raises: every failure, including a crash inside a parser on
hostile input, becomes Layer2Result(passed=False, rejection_reason=...).
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import re
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Any, Callable, Iterable
from xml.etree import ElementTree

import defusedxml.ElementTree as SafeElementTree
from defusedxml import DefusedXmlException

from app.security.constants import ALLOWED_FILE_EXTENSIONS

logger = logging.getLogger(__name__)

# Matches the fetcher's MAX_CONTENT_BYTES — one size ceiling for raw and
# sanitised content alike.
MAX_BYTES = 50 * 1024 * 1024

# XLSX and DOCX are ZIP containers: a 50MB upload can declare gigabytes of
# decompressed XML (zip bomb). The declared total is checked before any parser
# opens the archive; zipfile itself refuses to read past a member's declared
# size, so the declaration is binding.
MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024
MAX_ZIP_MEMBERS = 10_000

EMPTY_REASON = "sanitised content is empty — nothing extractable"

# Maximum characters passed to Claude for extraction.
# Stage 03 needs schema + a sample of records, not entire datasets.
# For JSON/CSV, smart_sample() produces a structured excerpt; for all other
# types a hard character cap applies as a safety net only.
# content_hash is ALWAYS computed from the full sanitised bytes (below).
MAX_EXTRACTION_CHARS = 80_000
_JSON_SAMPLE_ROWS = 20
_CSV_SAMPLE_ROWS = 20

# Characters a spreadsheet application treats as the start of a formula (OWASP
# CSV injection list: = + - @, plus tab and carriage return).
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
# A plain number cannot be a formula, so a leading sign on one is data and is
# kept ("-3.5" stays "-3.5"; "=1+2" and "-2+3" do not).
_NUMBER = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$")

# The csv module's default per-field limit (128KiB) would reject legitimate
# large fields; bound it by the content ceiling instead.
csv.field_size_limit(MAX_BYTES)


@dataclass(frozen=True)
class Layer2Result:
    passed: bool
    content_hash: str | None
    sanitised_content: bytes | None
    rejection_reason: str | None = None
    # Sampling metadata — populated when smart_sample() truncated the content
    # for extraction. content_hash is ALWAYS of the full sanitised bytes.
    was_sampled: bool = False
    full_record_count: int | None = None


class _Rejected(Exception):
    """A sanitiser refused the content; the message is the rejection reason."""


def _reject(reason: str) -> Layer2Result:
    return Layer2Result(passed=False, content_hash=None, sanitised_content=None, rejection_reason=reason)


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ── Shared helpers ────────────────────────────────────────────────────────────

def _decode_text(raw: bytes) -> str:
    """UTF-8 (BOM stripped) with a latin-1 fallback, which never fails."""
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


def _encode(text: str) -> bytes:
    # errors="replace" turns lone surrogates (possible from PDF text or JSON
    # escapes) into U+FFFD rather than failing the whole file.
    return text.replace("\x00", "").encode("utf-8", errors="replace")


def _neutralise_cell(value: str) -> str:
    """
    CSV/formula-injection guard: strip leading formula-trigger characters from
    any cell that is not a plain number.
    """
    value = value.replace("\x00", "")
    if _NUMBER.match(value.strip()):
        return value
    stripped = value.lstrip()
    while stripped.startswith(_FORMULA_PREFIXES):
        stripped = stripped[1:].lstrip()
    # Only rewrite the cell when a prefix was actually removed, so ordinary
    # leading whitespace in text cells is preserved.
    return stripped if stripped != value.lstrip() else value


class _CsvOut:
    """CSV writer with LF line endings and a running output-size ceiling."""

    def __init__(self) -> None:
        self._buf = io.StringIO()
        self._writer = csv.writer(self._buf, lineterminator="\n")
        self.has_content = False

    def line(self, text: str) -> None:
        self._buf.write(text + "\n")
        self._check_size()

    def row(self, cells: Iterable[str]) -> None:
        cells = [_neutralise_cell(c) for c in cells]
        if any(c.strip() for c in cells):
            self.has_content = True
        self._writer.writerow(cells)
        self._check_size()

    def _check_size(self) -> None:
        # Character count is a lower bound on encoded size; good enough to
        # stop runaway output long before memory becomes a problem.
        if self._buf.tell() > MAX_BYTES:
            raise _Rejected("sanitised content exceeds 50MB limit")

    def text(self) -> str:
        return self._buf.getvalue()


def _check_zip_container(raw: bytes, kind: str) -> None:
    """Reject archives that are not ZIPs or that declare a zip-bomb payload."""
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            members = archive.infolist()
    except zipfile.BadZipFile as exc:
        raise _Rejected(f"not a valid {kind} file (bad ZIP container): {exc}") from exc
    if len(members) > MAX_ZIP_MEMBERS:
        raise _Rejected(f"{kind} container has too many entries ({len(members)})")
    total = sum(m.file_size for m in members)
    if total > MAX_UNCOMPRESSED_BYTES:
        raise _Rejected(
            f"{kind} container declares {total} uncompressed bytes "
            f"(limit {MAX_UNCOMPRESSED_BYTES}) — possible zip bomb"
        )


def _cell_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    return str(value)


# ── Per-type sanitisers ───────────────────────────────────────────────────────
# Each returns sanitised text, or raises _Rejected. Any other exception is
# caught by run_layer2() and reported as a parse failure.

def _sanitise_csv(raw: bytes) -> str:
    out = _CsvOut()
    text = _decode_text(raw).replace("\x00", "")
    for row in csv.reader(io.StringIO(text, newline="")):
        out.row(row)
    if not out.has_content:
        raise _Rejected(EMPTY_REASON)
    return out.text()


def _reject_constant(name: str) -> None:
    raise _Rejected(f"invalid JSON: non-standard constant {name}")


def _sanitise_json(raw: bytes) -> str:
    try:
        # json.loads detects UTF-8/16/32 from bytes; NaN/Infinity are not JSON.
        value = json.loads(raw, parse_constant=_reject_constant)
    except _Rejected:
        raise
    except (ValueError, UnicodeDecodeError) as exc:
        raise _Rejected(f"invalid JSON: {exc}") from exc
    if value is None or value in ("", [], {}):
        raise _Rejected(EMPTY_REASON)
    # Canonical form (CLAUDE.md §10): sorted keys, no whitespace, UTF-8. Only
    # the parsed value survives — trailing payloads, comments and BOMs do not.
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sanitise_txt(raw: bytes) -> str:
    return _decode_text(raw).replace("\x00", "")


def _sanitise_xml(raw: bytes) -> str:
    try:
        # Defaults forbid entity declarations (billion laughs, XXE) and
        # external references; the stdlib parser underneath drops comments and
        # processing instructions, and tostring() never writes a DOCTYPE.
        root = SafeElementTree.fromstring(raw)
    except DefusedXmlException as exc:
        raise _Rejected(f"XML rejected by defusedxml ({type(exc).__name__}): {exc}") from exc
    except ElementTree.ParseError as exc:
        raise _Rejected(f"malformed XML: {exc}") from exc
    has_text = any(t.strip() for t in root.itertext())
    has_attrs = any(el.attrib for el in root.iter())
    if not (has_text or has_attrs):
        raise _Rejected(EMPTY_REASON)
    return ElementTree.tostring(root, encoding="unicode")


def _sanitise_xlsx(raw: bytes) -> str:
    _check_zip_container(raw, "XLSX")
    import openpyxl  # deferred: only XLSX ingestion pays the import cost

    # data_only=True: cached cell values only, formulae are never read.
    # read_only=True: streamed worksheet XML; VBA, embedded objects, images and
    # pivot caches are never loaded (keep_vba stays False).
    workbook = openpyxl.load_workbook(io.BytesIO(raw), data_only=True, read_only=True)
    try:
        out = _CsvOut()
        for sheet in workbook.worksheets:
            name = " ".join(str(sheet.title).split())
            out.line(f"--- SHEET: {name} ---")
            for values in sheet.iter_rows(values_only=True):
                cells = [_cell_text(v) for v in values]
                while cells and not cells[-1]:
                    cells.pop()
                if cells:
                    out.row(cells)
    finally:
        workbook.close()
    if not out.has_content:
        raise _Rejected(EMPTY_REASON)
    return out.text()


def _sanitise_docx(raw: bytes) -> str:
    _check_zip_container(raw, "DOCX")
    import docx  # deferred: only DOCX ingestion pays the import cost

    # python-docx refuses macro-enabled (.docm) main parts outright. Only text
    # runs are read — images, embedded objects, comments and revision
    # metadata are never touched.
    document = docx.Document(io.BytesIO(raw))
    parts = [p.text for p in document.paragraphs]
    # Statistical reports carry most of their data in tables; keep their cell
    # text (formula-guarded, as CSV) after the body paragraphs.
    for index, table in enumerate(document.tables, start=1):
        out = _CsvOut()
        out.line(f"--- TABLE {index} ---")
        for row in table.rows:
            out.row(cell.text for cell in row.cells)
        if out.has_content:
            parts.append(out.text().rstrip("\n"))
    text = "\n".join(parts)
    if not text.strip():
        raise _Rejected(EMPTY_REASON)
    return text


def _sanitise_pdf(raw: bytes) -> str:
    from pypdf import PdfReader  # deferred: only PDF ingestion pays the import cost

    reader = PdfReader(io.BytesIO(raw))
    if reader.is_encrypted:
        raise _Rejected("encrypted PDF")
    pages = [(page.extract_text() or "") for page in reader.pages]
    if not any(p.strip() for p in pages):
        # Scanned (image-only) PDFs land here: there is no text layer to pass on.
        raise _Rejected(EMPTY_REASON)
    return "".join(
        (f"\n\n--- PAGE {i + 1} ---\n\n" if i else "") + text for i, text in enumerate(pages)
    )


# ── Smart sampler ─────────────────────────────────────────────────────────────
# Produces a compact, schema-preserving excerpt for Claude extraction.
# INVARIANT: content_hash must be computed from the FULL sanitised bytes
# BEFORE this function is called. This function only affects what Claude sees.

def smart_sample(
    sanitised_text: str, file_extension: str
) -> tuple[str, bool, int | None]:
    """
    Return (excerpt, was_sampled, full_record_count).

    For JSON: preserve top-level structure; truncate each top-level array to
    _JSON_SAMPLE_ROWS items; record the full item count (from @odata.count or
    by counting the array). For CSV: keep header + _CSV_SAMPLE_ROWS data rows;
    record total row count. For all other types: apply MAX_EXTRACTION_CHARS
    hard cap only (was_sampled=True if truncated, count=None).

    Never raises — returns the full text unchanged on any parse error so that
    Stage 03 still receives valid content.
    """
    ext = file_extension.strip().lower().lstrip(".")

    if ext == "json":
        try:
            value = json.loads(sanitised_text)
        except (ValueError, TypeError):
            # Shouldn't happen — Layer 2 already validated JSON — but be safe.
            pass
        else:
            if isinstance(value, dict):
                # Count items in the first large array we find (OData pattern).
                full_count: int | None = None
                sampled = False
                result = {}
                for key, val in value.items():
                    if isinstance(val, list) and len(val) > _JSON_SAMPLE_ROWS:
                        full_count = (
                            value.get("@odata.count")
                            or value.get("count")
                            or len(val)
                        )
                        result[key] = val[:_JSON_SAMPLE_ROWS]
                        sampled = True
                    else:
                        result[key] = val
                if sampled:
                    preamble = (
                        f"[PDQE SAMPLE: dataset contains {full_count} records. "
                        f"Schema and first {_JSON_SAMPLE_ROWS} records shown "
                        f"for extraction. Full dataset reference preserved by "
                        f"content_hash.]\n\n"
                    )
                    excerpt = preamble + json.dumps(
                        result, sort_keys=True, separators=(",", ":"), ensure_ascii=False
                    )
                    return excerpt, True, int(full_count) if full_count is not None else None
            elif isinstance(value, list) and len(value) > _JSON_SAMPLE_ROWS:
                full_count = len(value)
                preamble = (
                    f"[PDQE SAMPLE: dataset contains {full_count} records. "
                    f"First {_JSON_SAMPLE_ROWS} shown for extraction.]\n\n"
                )
                excerpt = preamble + json.dumps(
                    value[:_JSON_SAMPLE_ROWS],
                    sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                )
                return excerpt, True, full_count

    elif ext == "csv":
        try:
            reader = csv.reader(io.StringIO(sanitised_text, newline=""))
            rows = list(reader)
        except Exception:  # noqa: BLE001
            rows = []
        if rows:
            total_rows = len(rows) - 1  # subtract header
            if total_rows > _CSV_SAMPLE_ROWS:
                sample_rows = rows[:1 + _CSV_SAMPLE_ROWS]  # header + N data rows
                out = _CsvOut()
                out.line(
                    f"# [PDQE SAMPLE: {total_rows} data rows total; "
                    f"header + first {_CSV_SAMPLE_ROWS} rows shown for extraction]"
                )
                for row in sample_rows:
                    out.row(row)
                return out.text(), True, total_rows

    # Safety net for all other types: hard character cap.
    if len(sanitised_text) > MAX_EXTRACTION_CHARS:
        return sanitised_text[:MAX_EXTRACTION_CHARS], True, None

    return sanitised_text, False, None


_SANITISERS: dict[str, Callable[[bytes], str]] = {
    "csv": _sanitise_csv,
    "json": _sanitise_json,
    "txt": _sanitise_txt,
    "xml": _sanitise_xml,
    "xlsx": _sanitise_xlsx,
    "docx": _sanitise_docx,
    "pdf": _sanitise_pdf,
}

# Layer 2 must cover exactly the Layer 1 whitelist — fail at import, not at
# ingestion, if the two ever drift.
if set(_SANITISERS) != set(ALLOWED_FILE_EXTENSIONS):
    raise RuntimeError("Layer 2 sanitisers must cover exactly the Layer 1 whitelist")


# ── Entry point ───────────────────────────────────────────────────────────────

def run_layer2(raw_content: bytes, file_extension: str) -> Layer2Result:
    """
    Sanitise raw upload bytes: strip macros, embedded scripts, executable
    code, and metadata; compute the content hash of the sanitised output.

    Never raises. Returns passed=True with the sanitised UTF-8 bytes and their
    SHA-256, or passed=False with a rejection_reason.
    """
    ext = file_extension.strip().lower().lstrip(".") if isinstance(file_extension, str) else ""
    try:
        if not isinstance(raw_content, (bytes, bytearray)):
            return _reject(f"content must be bytes, got {type(raw_content).__name__}")
        raw = bytes(raw_content)
        if len(raw) > MAX_BYTES:
            return _reject(f"content exceeds 50MB limit ({len(raw)} bytes)")
        # Defence in depth: Layer 1 should already have refused anything else.
        sanitiser = _SANITISERS.get(ext)
        if sanitiser is None:
            return _reject(f"unsupported file extension: {file_extension}")
        if not raw.strip():
            return _reject(EMPTY_REASON)

        sanitised = _encode(sanitiser(raw))
        if not sanitised.strip():
            return _reject(EMPTY_REASON)
        if len(sanitised) > MAX_BYTES:
            return _reject(f"sanitised content exceeds 50MB limit ({len(sanitised)} bytes)")
    except _Rejected as exc:
        logger.info("layer2: rejected .%s content: %s", ext, exc)
        return _reject(str(exc))
    except Exception as exc:  # noqa: BLE001 — hostile input may break any parser; never propagate
        logger.warning("layer2: .%s content could not be parsed: %s: %s", ext, type(exc).__name__, exc)
        return _reject(f"could not parse .{ext} content ({type(exc).__name__}): {str(exc)[:200]}")

    # INVARIANT: content_hash is always SHA-256 of the FULL sanitised bytes.
    # smart_sample() runs AFTER this — it only affects what Claude sees at
    # Stage 03. The deduplication key is never derived from truncated content.
    content_hash = _sha256_hex(sanitised)
    assert content_hash == _sha256_hex(sanitised), (  # belt-and-suspenders
        "content_hash must be SHA-256 of full sanitised bytes"
    )

    sanitised_text = sanitised.decode("utf-8", errors="replace")
    sampled_text, was_sampled, full_record_count = smart_sample(sanitised_text, ext)
    sampled_bytes = _encode(sampled_text)

    if was_sampled:
        logger.info(
            "layer2: smart_sample applied to .%s content "
            "(%d → %d chars for extraction, full_record_count=%s, sha256 %s)",
            ext, len(sanitised_text), len(sampled_text), full_record_count, content_hash,
        )
    else:
        logger.info("layer2: passed .%s content (%d → %d bytes, sha256 %s)", ext, len(raw), len(sanitised), content_hash)

    return Layer2Result(
        passed=True,
        content_hash=content_hash,
        sanitised_content=sampled_bytes,
        was_sampled=was_sampled,
        full_record_count=full_record_count,
    )
