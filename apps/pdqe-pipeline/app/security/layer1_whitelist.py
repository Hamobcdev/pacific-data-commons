"""
PDQE Stage 02 — Layer 1: File type whitelist.

Accept only PDF, CSV, JSON, XLSX, DOCX, TXT, XML. Reject everything else at
the gate, before any other layer runs (Decision 58).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.security.constants import ALLOWED_FILE_EXTENSIONS


@dataclass(frozen=True)
class Layer1Result:
    passed: bool
    file_extension: str
    rejection_reason: str | None = None


def validate_file_type(file_extension: str) -> bool:
    """Case-insensitive whitelist check. Pure function — no I/O."""
    return file_extension.strip().lower() in ALLOWED_FILE_EXTENSIONS


def check_layer1(file_name: str, file_extension: str) -> Layer1Result:
    """
    Run Layer 1 against a single upload attempt.

    Does not raise on rejection — a rejected file is still a recorded
    ingestion attempt (Decision 58 accountability trail), not a dropped one.
    """
    normalised = file_extension.strip().lower()

    if validate_file_type(normalised):
        return Layer1Result(passed=True, file_extension=normalised)

    return Layer1Result(
        passed=False,
        file_extension=normalised,
        rejection_reason=(
            f"File type '{normalised}' is not permitted for '{file_name}'. "
            f"Layer 1 whitelist: {', '.join(sorted(ALLOWED_FILE_EXTENSIONS))}."
        ),
    )
