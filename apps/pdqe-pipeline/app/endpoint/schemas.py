"""
PDQE Stage 08 — Endpoint Generation Schemas.

An endpoint spec is DATA — a structure describing a machine-queryable PDC
endpoint — never code. Nothing in it is ever executed, evaluated or used as
a template source. Path format, parameter types, pricing tier, provenance and
the integrity hash are assigned by deterministic code (app.endpoint.templates
and app.endpoint.generator); these models then re-check every rule.

P9 (CLAUDE.md): every input is untrusted data — rows read back from Supabase
included — and is validated here. extra="forbid" on every model. The
invariants below mirror the CHECK constraints on pdqe.endpoints (migration
20261012000004).
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.dataset.schemas import MAX_DESCRIPTION_CHARS, MAX_TITLE_CHARS
from app.qualification.schemas import DomainClassification


class PricingTier(str, Enum):
    T0 = "T0"
    T1 = "T1"
    T2 = "T2"
    T3 = "T3"
    T4 = "T4"
    T5 = "T5"


class EndpointStatus(str, Enum):
    DRAFT = "DRAFT"
    VALIDATED = "VALIDATED"
    PUBLISHED = "PUBLISHED"
    DEPRECATED = "DEPRECATED"


# Default USDC price per query. Mirrors pdqe.pricing_tier_default_price().
TIER_PRICES: dict[PricingTier, Decimal] = {
    PricingTier.T0: Decimal("0.001"),
    PricingTier.T1: Decimal("0.01"),
    PricingTier.T2: Decimal("0.10"),
    PricingTier.T3: Decimal("0.50"),
    PricingTier.T4: Decimal("2.00"),
    PricingTier.T5: Decimal("5.00"),
}

# NUMERIC(10,4) upper bound.
MAX_PRICE_USDC = Decimal("999999.9999")

SLUG_PATTERN = r"^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$"
PATH_PREFIX = "/pacific/"
_PARAM_NAME_PATTERN = r"^[a-z][a-z0-9_]{0,63}$"
_SHA256_PATTERN = r"^[0-9a-f]{64}$"
_ALGORAND_ADDRESS_PATTERN = r"^[A-Z2-7]{58}$"

MAX_PARAMETERS = 20
MAX_ENUM_VALUES = 100
MAX_ENUM_VALUE_CHARS = 100
MAX_PARAM_DESCRIPTION_CHARS = 500
MAX_QUERY_EXAMPLES = 10
MAX_JSON_DOC_BYTES = 16_384

ParameterType = Literal["string", "integer", "date", "enum"]


def domain_path_segment(domain: DomainClassification | str) -> str:
    """DomainClassification → path segment: lowercase, underscores to hyphens."""
    value = domain.value if isinstance(domain, DomainClassification) else str(domain)
    return value.lower().replace("_", "-")


def _check_json_doc(value, field: str):
    """Must serialise to JSON within the size bound (no callables, no objects)."""
    try:
        encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be JSON-serialisable data: {exc}") from exc
    if len(encoded.encode("utf-8")) > MAX_JSON_DOC_BYTES:
        raise ValueError(f"{field} must be at most {MAX_JSON_DOC_BYTES} bytes when serialised")
    return value


class ParameterDefinition(BaseModel):
    """One query parameter of an endpoint. Types come from a closed set."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(pattern=_PARAM_NAME_PATTERN)
    type: ParameterType
    description: str = Field(min_length=1, max_length=MAX_PARAM_DESCRIPTION_CHARS)
    required: bool = False
    enum_values: Optional[list[str]] = None

    @model_validator(mode="after")
    def _check_enum(self):
        if self.type == "enum":
            if not self.enum_values:
                raise ValueError(f"parameter {self.name}: type 'enum' requires enum_values")
            if len(self.enum_values) > MAX_ENUM_VALUES:
                raise ValueError(f"parameter {self.name}: at most {MAX_ENUM_VALUES} enum_values")
            if len(set(self.enum_values)) != len(self.enum_values):
                raise ValueError(f"parameter {self.name}: duplicate enum value")
            for v in self.enum_values:
                if not v.strip() or len(v) > MAX_ENUM_VALUE_CHARS:
                    raise ValueError(f"parameter {self.name}: enum values must be 1-{MAX_ENUM_VALUE_CHARS} chars")
        elif self.enum_values is not None:
            raise ValueError(f"parameter {self.name}: enum_values only allowed for type 'enum'")
        return self


class _EndpointFields(BaseModel):
    """Fields and invariants shared by a generated spec and a stored row."""

    model_config = ConfigDict(extra="forbid")

    dataset_id: UUID
    collection_id: Optional[UUID] = None
    path: str = Field(max_length=200)
    slug: str = Field(pattern=SLUG_PATTERN)
    title: str = Field(min_length=1, max_length=MAX_TITLE_CHARS)
    description: Optional[str] = Field(default=None, max_length=MAX_DESCRIPTION_CHARS)
    domain: DomainClassification
    pricing_tier: PricingTier
    price_usdc: Decimal = Field(gt=0, le=MAX_PRICE_USDC, decimal_places=4)
    cultural_sovereignty: bool = False
    response_schema: dict
    parameters: list[ParameterDefinition] = Field(max_length=MAX_PARAMETERS)
    query_examples: list[dict] = Field(max_length=MAX_QUERY_EXAMPLES)
    endpoint_hash: str = Field(pattern=_SHA256_PATTERN)
    provenance_dataset_id: UUID
    provenance_source_ids: list[UUID] = Field(min_length=1)

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("title must not be blank")
        return stripped

    @field_validator("response_schema")
    @classmethod
    def _response_schema(cls, value: dict) -> dict:
        return _check_json_doc(value, "response_schema")

    @field_validator("query_examples")
    @classmethod
    def _query_examples(cls, value: list[dict]) -> list[dict]:
        return _check_json_doc(value, "query_examples")

    @model_validator(mode="after")
    def _check_invariants(self):
        expected_path = f"{PATH_PREFIX}{domain_path_segment(self.domain)}/{self.slug}"
        if not self.path.startswith(PATH_PREFIX):
            raise ValueError(f"path must start with {PATH_PREFIX}")
        if self.path != expected_path:
            raise ValueError(f"path must be {expected_path} (/pacific/{{domain}}/{{slug}})")
        if self.pricing_tier == PricingTier.T5 and not self.cultural_sovereignty:
            raise ValueError("pricing tier T5 requires cultural_sovereignty = True")
        if self.provenance_dataset_id != self.dataset_id:
            raise ValueError("provenance_dataset_id must equal dataset_id")
        if len(set(self.provenance_source_ids)) != len(self.provenance_source_ids):
            raise ValueError("duplicate id in provenance_source_ids")
        names = [p.name for p in self.parameters]
        if len(set(names)) != len(names):
            raise ValueError("duplicate parameter name")
        return self


class EndpointSpec(_EndpointFields):
    """
    The full generated endpoint specification. This is data — never executed.

    A freshly generated spec is priced at or above its tier default (the
    provider may only raise it, at Stage 09) and always carries a description.
    """

    description: str = Field(min_length=1, max_length=MAX_DESCRIPTION_CHARS)

    @model_validator(mode="after")
    def _check_price_floor(self):
        floor = TIER_PRICES[self.pricing_tier]
        if self.price_usdc < floor:
            raise ValueError(
                f"price_usdc {self.price_usdc} is below the {self.pricing_tier.value} default {floor}"
            )
        return self


class EndpointRecord(_EndpointFields):
    """Full pdqe.endpoints row as returned from the DB."""

    endpoint_id: UUID
    provider_wallet: Optional[str] = Field(default=None, pattern=_ALGORAND_ADDRESS_PATTERN)
    status: EndpointStatus
    generated_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def _check_published_wallet(self):
        if self.status == EndpointStatus.PUBLISHED and not self.provider_wallet:
            raise ValueError("a PUBLISHED endpoint requires provider_wallet")
        return self


class EndpointGenerateRequest(BaseModel):
    """Optional body for POST /endpoint/generate/{dataset_id}."""

    model_config = ConfigDict(extra="forbid")

    collection_id: Optional[UUID] = None


def is_valid_slug(value: str) -> bool:
    return re.fullmatch(SLUG_PATTERN, value) is not None
