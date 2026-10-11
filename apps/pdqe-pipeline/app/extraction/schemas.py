"""
PDQE Stage 03 — Layer 4: Extraction output schema.

P9 (CLAUDE.md): Every pipeline output is validated against a strict JSON
schema before use. No LLM token becomes executable code or instruction.
Endpoint generation is deterministic template instantiation — the LLM fills
values, a template engine assembles code.

This module defines:
  - ExtractionOutput   — the full P9 schema for Stage 03 Claude extraction
  - ExtractionResult   — the Layer 4 validation envelope
  - validate_extraction_output() — deterministic validator; rejects, never coerces

The schema is versioned (schema_version field). Any addition of a new required
field must bump the version; existing validated records are not retroactively
invalidated.

Mirror: app/security/layer3_prompt.py's EXTRACTION_SCHEMA_INSTRUCTIONS must
list exactly the same top-level keys. If this schema changes, change the
prompt too.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ── Domain and type enumerations ──────────────────────────────────────────────
# These mirror pdqe.source_domain and pdqe.source_type in the database.
# Stage 04 (Jev) performs authoritative domain qualification; these are
# *candidate* labels proposed by Claude, not final classifications.

SourceDomain = Literal[
    "FISHERIES",
    "CLIMATE",
    "TRADE",
    "AGRICULTURE",
    "OCEAN",
    "ENVIRONMENT",
    "ECONOMICS",
    "GOVERNANCE",
    "HEALTH",
    "OTHER",
]

SourceType = Literal[
    "PDF_DOCUMENT",
    "API_ENDPOINT",
    "SPREADSHEET",
    "WEB_PAGE",
    "DATABASE_EXPORT",
    "OTHER",
]

CURRENT_SCHEMA_VERSION = "pdqe-extraction-v1"


# ── Sub-schemas ───────────────────────────────────────────────────────────────

class FieldProvenance(BaseModel):
    """Evidence reference for a single extracted field."""

    model_config = ConfigDict(extra="forbid")

    source_ref: str = Field(
        min_length=1,
        description="Document location: page, section, URL, or 'document metadata'.",
    )
    quote: str | None = Field(
        default=None,
        description="Verbatim text from the source document supporting this value.",
    )


class ExtractedVariable(BaseModel):
    """A variable or measurement series identified in the source document."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, description="Variable name as it appears in the document.")
    unit: str | None = Field(default=None, description="Unit of measurement (e.g. 'tonnes', 'USD').")
    description: str | None = Field(default=None)
    provenance: FieldProvenance | None = Field(
        default=None,
        description="Where in the document this variable was identified.",
    )


class ExtractedTable(BaseModel):
    """A data table identified in the source document."""

    model_config = ConfigDict(extra="forbid")

    table_ref: str = Field(
        min_length=1,
        description="How the table is labelled in the document (e.g. 'Table 3', 'Figure 2').",
    )
    description: str = Field(min_length=1)
    columns: list[str] = Field(
        default_factory=list,
        description="Column headers as they appear in the table.",
    )
    row_count_estimate: int | None = Field(
        default=None,
        ge=0,
        description="Approximate number of data rows (not counting the header).",
    )
    provenance: FieldProvenance | None = None


# ── Main extraction output schema ─────────────────────────────────────────────

class ExtractionOutput(BaseModel):
    """
    P9 extraction output schema — Stage 03.

    Every field Claude returns must conform to this schema before the output
    is accepted into the pipeline. extra="forbid" means any unknown key Claude
    adds is a hard validation failure — the response is rejected, not
    partially accepted.

    Fields Claude cannot determine are null — Claude must never invent values
    for fields it cannot find evidence for in the document.
    """

    model_config = ConfigDict(extra="forbid")

    # Schema version — lets Stage 04+ know which version of the schema produced
    # this record. Must equal CURRENT_SCHEMA_VERSION.
    schema_version: Literal["pdqe-extraction-v1"]

    # ── Core metadata ──────────────────────────────────────────────────────────
    title: str = Field(min_length=3, description="Document / dataset title.")
    publisher_name: str = Field(min_length=2, description="Organisation that published this.")
    source_type: SourceType

    # Candidate domains: Claude proposes; Stage 04 qualifies.
    # At least one is required.
    candidate_domains: list[SourceDomain] = Field(min_length=1)
    geographic_scope: list[str] = Field(
        default_factory=list,
        description="Country names, ocean areas, or region names covered by this source.",
    )

    # ── Dates ─────────────────────────────────────────────────────────────────
    # ISO 8601 string (date or datetime). Not a datetime object — string lets
    # Claude return partial dates ("2023", "2023-Q1") without a schema error.
    # Stage 05 (deterministic validation) normalises this.
    published_at: str | None = Field(
        default=None,
        description="Publication or reporting date as found in the document (ISO 8601 preferred).",
    )
    date_confidence: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Confidence that published_at is accurate (0 = not found, 1 = explicitly stated).",
    )

    # ── Licence ───────────────────────────────────────────────────────────────
    # 'Unknown is not approval' (PDQE non-negotiable). Claude may not infer
    # a licence that is not stated; null is the correct response.
    licence_text: str | None = Field(
        default=None,
        description="Licence statement as found in the document. null if not stated.",
    )
    licence_url: str | None = Field(
        default=None,
        description="URL to the full licence text. null if not found.",
    )
    licence_confidence: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Confidence in the licence identification (0 = not found, 1 = explicit).",
    )

    # ── Methodology ───────────────────────────────────────────────────────────
    methodology: str | None = Field(
        default=None,
        description="Summary of the data collection or research methodology described in the document.",
    )

    # ── Variables and tables ──────────────────────────────────────────────────
    variables: list[ExtractedVariable] = Field(
        default_factory=list,
        description="Variables and measurement series identified in the document.",
    )
    tables: list[ExtractedTable] = Field(
        default_factory=list,
        description="Data tables identified in the document.",
    )

    # ── Provenance map ────────────────────────────────────────────────────────
    # Per-field evidence. Keys are field names from this schema.
    # Value is where in the document Claude found the value.
    provenance: dict[str, FieldProvenance] = Field(
        default_factory=dict,
        description="Per-field evidence map: { 'title': { 'source_ref': 'p.1', 'quote': '...' } }.",
    )

    # ── Multi-document synthesis ──────────────────────────────────────────────
    # When this extraction synthesises multiple source documents, Claude lists
    # their titles / identifiers here so provenance is preserved.
    contributing_sources: list[str] = Field(
        default_factory=list,
        description="Source titles or identifiers if this is a multi-document synthesis.",
    )

    # ── Overall quality signal ────────────────────────────────────────────────
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description=(
            "Holistic extraction confidence: 0 = document too incomplete to extract "
            "reliably, 1 = all required fields found with strong evidence."
        ),
    )
    extraction_notes: str | None = Field(
        default=None,
        description=(
            "Notes on extraction quality — e.g. 'Title page missing', "
            "'Conflicting dates on pages 3 and 7'. null for clean extractions."
        ),
    )


# ── Layer 4 validation envelope ───────────────────────────────────────────────

class ExtractionResult(BaseModel):
    """
    The Layer 4 validation envelope wrapping an ExtractionOutput attempt.

    passed=True  → extracted is populated, rejection_reason is None.
    passed=False → extracted is None, rejection_reason explains the failure.

    Non-conforming output is rejected outright — no partial acceptance, no
    coercion. A retry requires a human decision (Stage 06).
    """

    passed: bool
    extracted: ExtractionOutput | None = None
    rejection_reason: str | None = None


def validate_extraction_output(raw_output: dict) -> ExtractionResult:
    """
    Deterministic Layer 4 validator for Claude extraction output.

    Validates raw_output against ExtractionOutput. Rejects anything that:
    - is missing a required field
    - has an extra/unexpected key (extra="forbid")
    - has a value that fails a field constraint
    - has schema_version != CURRENT_SCHEMA_VERSION

    Never retries, never coerces, never partially accepts.
    Returns ExtractionResult with passed=False on any failure.

    P9: this function is deterministic code — the last gate before any model
    output enters the pipeline state.
    """
    try:
        extracted = ExtractionOutput.model_validate(raw_output)
    except Exception as exc:  # noqa: BLE001
        return ExtractionResult(passed=False, rejection_reason=str(exc))

    if extracted.schema_version != CURRENT_SCHEMA_VERSION:
        return ExtractionResult(
            passed=False,
            rejection_reason=(
                f"schema_version mismatch: expected '{CURRENT_SCHEMA_VERSION}', "
                f"got '{extracted.schema_version}'"
            ),
        )

    return ExtractionResult(passed=True, extracted=extracted)
