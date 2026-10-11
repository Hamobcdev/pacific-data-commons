"""
PDQE Stage 08 — Deterministic endpoint templates by domain.

Templates enforce path format, parameter types and response schema shape.
Every value here is a literal chosen in code review — nothing is derived
from model output. CRITICAL: no template executes model-generated code;
specs are plain data structures.

Every response schema requires the Decision 61 fields (data_currency,
reporting_lag_note, attribution, temporal bounds) plus the provenance links
back to the dataset and its sources.
"""

from __future__ import annotations

import copy
from typing import Any, Optional

from app.endpoint.schemas import (
    PATH_PREFIX,
    PricingTier,
    domain_path_segment,
    is_valid_slug,
)
from app.qualification.schemas import DomainClassification

# ── Parameters ────────────────────────────────────────────────────────────────

_YEAR = {
    "name": "year",
    "type": "integer",
    "description": "Reporting year (four digits, e.g. 2024).",
    "required": False,
}
_COUNTRY = {
    "name": "country",
    "type": "string",
    "description": "Country or territory name, or ISO 3166-1 alpha-2 code, within the dataset's geography scope.",
    "required": False,
}


def _string(name: str, description: str) -> dict:
    return {"name": name, "type": "string", "description": description, "required": False}


_DOMAIN_PARAMETERS: dict[DomainClassification, list[dict]] = {
    DomainClassification.FISHERIES: [
        _YEAR, _COUNTRY,
        _string("species", "Species common or scientific name (e.g. skipjack, Katsuwonus pelamis)."),
    ],
    DomainClassification.OCEAN: [
        _YEAR,
        _string("region", "Ocean region or EEZ name within the dataset's geography scope."),
        _string("variable", "Measured variable (e.g. sea_surface_temperature)."),
    ],
    DomainClassification.CLIMATE: [
        _YEAR, _COUNTRY,
        _string("variable", "Climate variable (e.g. rainfall, temperature_anomaly)."),
    ],
    DomainClassification.TRADE: [
        _YEAR, _COUNTRY,
        _string("commodity", "Commodity name or HS code."),
        {
            "name": "flow",
            "type": "enum",
            "description": "Trade direction.",
            "required": False,
            "enum_values": ["export", "import"],
        },
    ],
    DomainClassification.AGRICULTURE: [
        _YEAR, _COUNTRY,
        _string("commodity", "Crop or livestock commodity name."),
    ],
    DomainClassification.ECONOMICS: [
        _YEAR, _COUNTRY,
        _string("indicator", "Economic indicator code or name."),
    ],
    DomainClassification.ENVIRONMENT: [
        _YEAR, _COUNTRY,
        _string("indicator", "Environmental indicator code or name."),
    ],
    DomainClassification.HEALTH: [
        _YEAR, _COUNTRY,
        _string("indicator", "Health indicator code or name."),
    ],
    DomainClassification.GOVERNANCE: [
        _YEAR, _COUNTRY,
        _string("topic", "Governance or policy topic."),
    ],
}

_DEFAULT_PARAMETERS: list[dict] = [_YEAR, _COUNTRY]


def _domain(domain: DomainClassification | str) -> DomainClassification:
    return domain if isinstance(domain, DomainClassification) else DomainClassification(domain)


def get_path_template(domain: DomainClassification | str, slug: str) -> str:
    """
    Enforce the /pacific/{domain_lower}/{slug} format. Raises ValueError on an
    unknown domain or a slug outside the allowed pattern — a slug is never
    trusted to be safe just because it came from slugify().
    """
    d = _domain(domain)
    if not is_valid_slug(slug):
        raise ValueError(f"slug {slug!r} does not match the allowed pattern")
    return f"{PATH_PREFIX}{domain_path_segment(d)}/{slug}"


def get_default_parameters(domain: DomainClassification | str) -> list[dict]:
    """Domain-specific default parameters (e.g. fisheries → year, country, species)."""
    return copy.deepcopy(_DOMAIN_PARAMETERS.get(_domain(domain), _DEFAULT_PARAMETERS))


# ── Response schema ───────────────────────────────────────────────────────────

_RECORD_FIELDS: dict[DomainClassification, dict[str, dict]] = {
    DomainClassification.FISHERIES: {
        "species": {"type": "string"},
        "catch_tonnes": {"type": ["number", "null"]},
    },
    DomainClassification.OCEAN: {
        "region": {"type": "string"},
        "variable": {"type": "string"},
    },
    DomainClassification.CLIMATE: {"variable": {"type": "string"}},
    DomainClassification.TRADE: {
        "commodity": {"type": "string"},
        "flow": {"type": "string", "enum": ["export", "import"]},
    },
    DomainClassification.AGRICULTURE: {"commodity": {"type": "string"}},
    DomainClassification.ECONOMICS: {"indicator": {"type": "string"}},
    DomainClassification.ENVIRONMENT: {"indicator": {"type": "string"}},
    DomainClassification.HEALTH: {"indicator": {"type": "string"}},
    DomainClassification.GOVERNANCE: {"topic": {"type": "string"}},
}

_COMMON_RECORD_FIELDS: dict[str, dict] = {
    "year": {"type": ["integer", "null"]},
    "country": {"type": ["string", "null"]},
    "value": {"type": ["number", "string", "null"]},
    "unit": {"type": ["string", "null"]},
}


def get_default_response_schema(domain: DomainClassification | str) -> dict:
    """
    Domain-specific response schema (JSON Schema shaped documentation).
    Every response carries attribution, data currency, reporting lag,
    temporal bounds and provenance (Decision 61).
    """
    d = _domain(domain)
    record_props = {**_COMMON_RECORD_FIELDS, **copy.deepcopy(_RECORD_FIELDS.get(d, {}))}
    return {
        "type": "object",
        "required": [
            "data", "attribution", "data_currency", "reporting_lag_note",
            "temporal_bounds", "provenance",
        ],
        "properties": {
            "data": {
                "type": "array",
                "items": {"type": "object", "properties": record_props},
            },
            "attribution": {
                "type": "object",
                "required": ["upstream_source", "licence"],
                "properties": {
                    "upstream_source": {"type": "string"},
                    "original_source": {"type": ["string", "null"]},
                    "licence": {"type": "string"},
                    "certification_note": {"type": "string"},
                },
            },
            "data_currency": {"type": "string", "description": "When the upstream data was last updated."},
            "reporting_lag_note": {"type": ["string", "null"]},
            "temporal_bounds": {
                "type": "object",
                "properties": {
                    "start": {"type": ["string", "null"]},
                    "end": {"type": ["string", "null"]},
                },
            },
            "provenance": {
                "type": "object",
                "required": ["dataset_id", "source_ids", "endpoint_hash"],
                "properties": {
                    "dataset_id": {"type": "string", "format": "uuid"},
                    "source_ids": {"type": "array", "items": {"type": "string", "format": "uuid"}},
                    "endpoint_hash": {"type": "string"},
                },
            },
        },
    }


# ── Query examples ────────────────────────────────────────────────────────────

def _year_from(value: Optional[str]) -> Optional[int]:
    """A four-digit year at the start of a free-text period, else None."""
    if value and len(value) >= 4 and value[:4].isdigit():
        return int(value[:4])
    return None


def build_query_examples(path: str, parameters: list[dict], dataset: dict) -> list[dict]:
    """
    Deterministic query examples from the parameter list and the dataset's
    own (human-approved) geography and time period. No free text is invented.
    """
    names = {p["name"] for p in parameters}
    examples: list[dict] = [{"description": "All records", "path": path, "params": {}}]

    params: dict[str, Any] = {}
    year = _year_from(dataset.get("time_period_end")) or _year_from(dataset.get("time_period_start"))
    if year is not None and "year" in names:
        params["year"] = year
    geography = dataset.get("geography_scope") or []
    if geography and "country" in names:
        params["country"] = geography[0]
    if params:
        examples.append({"description": "Filtered by " + ", ".join(sorted(params)), "path": path, "params": params})
    return examples


# ── Pricing ───────────────────────────────────────────────────────────────────

_PDF_SOURCE_TYPE = "PDF_DOCUMENT"
_T3_MIN_COMPLETENESS = 3
_T4_DOMAINS = (DomainClassification.ECONOMICS.value, DomainClassification.FISHERIES.value)


def dataset_cultural_sovereignty(dataset: dict) -> bool:
    """
    The dataset's sovereign/community-owned flag. Strict: only the JSON
    boolean true in metadata.cultural_sovereignty counts (the same rule the
    pdqe.endpoints insert trigger applies).
    """
    metadata = dataset.get("metadata") or {}
    return isinstance(metadata, dict) and metadata.get("cultural_sovereignty") is True


def assign_pricing_tier(
    dataset: dict, assessment: dict, source: Optional[dict] = None
) -> tuple[PricingTier, bool]:
    """
    Deterministic pricing tier from dataset/assessment/source properties.

    T5: cultural_sovereignty on the dataset — takes precedence over all else
    T4: composite multi-nation index — ≥2 sources, ≥2 geographies,
        domain ECONOMICS or FISHERIES
    T3: PDF-extracted (source_type PDF_DOCUMENT) and Jev completeness_score ≥ 3
    T2: multi-source (≥2 contributing sources)
    T1: single validated source
    T0 is never assigned here: Stage 08 only sees validated data.

    Returns (tier, cultural_sovereignty) — the caller sets both on the spec.
    """
    if dataset_cultural_sovereignty(dataset):
        return PricingTier.T5, True

    source_count = len(set(str(s) for s in (dataset.get("source_ids") or [])))
    geography_count = len(set(dataset.get("geography_scope") or []))
    domain = str(dataset.get("domain"))
    completeness = assessment.get("completeness_score")
    source_type = (source or {}).get("source_type")

    if source_count >= 2 and geography_count >= 2 and domain in _T4_DOMAINS:
        return PricingTier.T4, False
    if (
        source_type == _PDF_SOURCE_TYPE
        and isinstance(completeness, int)
        and not isinstance(completeness, bool)
        and completeness >= _T3_MIN_COMPLETENESS
    ):
        return PricingTier.T3, False
    if source_count >= 2:
        return PricingTier.T2, False
    return PricingTier.T1, False
