"""
PDQE Stage 02 — Layer 4: Output schema definition.

Every Claude output is validated against this strict schema before any use
(P9 — LLM output is untrusted input). Non-conforming output is rejected, not
retried automatically — a retry-without-human-review path would let a model
quietly route around validation by trying again until something parses.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

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


class ExtractedSourceMetadata(BaseModel):
    """
    Layer 4 output schema. Mirrors the fields Claude is asked to populate in
    app.security.layer3_prompt.EXTRACTION_SCHEMA_INSTRUCTIONS exactly — if
    one changes, change both.
    """

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=3)
    publisher_name: str = Field(min_length=2)
    source_type: SourceType
    candidate_domains: list[SourceDomain] = Field(min_length=1)
    geographic_scope: list[str] = Field(default_factory=list)
    licence_text: str | None = None
    licence_url: str | None = None
    published_at: datetime | None = None
    confidence: float = Field(ge=0.0, le=1.0)


class Layer4Result(BaseModel):
    passed: bool
    extracted: ExtractedSourceMetadata | None = None
    rejection_reason: str | None = None


def validate_layer4_output(raw_output: dict) -> Layer4Result:
    """
    Validate a Claude response against the Layer 4 schema. Rejects anything
    that does not conform — unknown/extra keys included (ConfigDict extra
    ="forbid") — rather than coercing or partially accepting it.
    """
    try:
        extracted = ExtractedSourceMetadata.model_validate(raw_output)
    except Exception as exc:  # noqa: BLE001 — surfaced as a rejection reason, never re-raised as code
        return Layer4Result(passed=False, rejection_reason=str(exc))

    return Layer4Result(passed=True, extracted=extracted)
