"""
PDQE Stage 09 — Automated endpoint validation.

Runs before a generated (DRAFT) endpoint is offered to its provider. All
checks are deterministic. No model calls.

Checks run on the raw pdqe.endpoints row, not the parsed EndpointRecord: a
row that fails strict parsing must still produce a full report of what is
wrong with it, so every check runs regardless of earlier failures. The row
is untrusted data (P9) — every check tolerates wrong types and reports them
as a failure rather than raising.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Optional
from uuid import UUID

from pydantic import ValidationError

from app.endpoint.generator import compute_endpoint_hash
from app.endpoint.schemas import (
    PATH_PREFIX,
    SLUG_PATTERN,
    TIER_PRICES,
    EndpointRecord,
    ParameterDefinition,
    PricingTier,
    domain_path_segment,
)
from app.endpoint.templates import get_default_parameters
from app.integration import supabase_client as db
from app.integration.schemas import EndpointValidationOutput, ValidationCheckResult
from app.qualification.schemas import DomainClassification

# Classified as "none of the above" — no publishable domain path.
_UNPUBLISHABLE_DOMAINS = frozenset({DomainClassification.NONE_OF_THE_ABOVE})

_PATH_SHAPE = re.compile(r"^/pacific/[a-z0-9-]+/[a-z0-9-]+$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")

CheckFn = Callable[[dict], tuple[bool, str]]


# ── Value helpers (untrusted row → typed value or None) ──────────────────────

def _domain(row: dict) -> Optional[DomainClassification]:
    try:
        return DomainClassification(row.get("domain"))
    except ValueError:
        return None


def _tier(row: dict) -> Optional[PricingTier]:
    try:
        return PricingTier(row.get("pricing_tier"))
    except ValueError:
        return None


def _price(row: dict) -> Optional[Decimal]:
    value = row.get("price_usdc")
    if isinstance(value, bool) or not isinstance(value, (int, float, str, Decimal)):
        return None
    try:
        price = Decimal(str(value))
    except InvalidOperation:
        return None
    return price if price.is_finite() else None


def _nonblank_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _parse_record(row: dict) -> tuple[Optional[EndpointRecord], str]:
    try:
        return EndpointRecord.model_validate(row), ""
    except ValidationError as exc:
        return None, f"{exc.error_count()} schema error(s): " + "; ".join(
            f"{'.'.join(str(p) for p in e['loc']) or 'row'}: {e['msg']}" for e in exc.errors()[:5]
        )


# ── Checks ────────────────────────────────────────────────────────────────────

def _check_path_format(row: dict) -> tuple[bool, str]:
    path = row.get("path")
    if not isinstance(path, str) or not _PATH_SHAPE.fullmatch(path):
        return False, f"path must be {PATH_PREFIX}{{domain}}/{{slug}} — lowercase, no spaces"
    domain = _domain(row)
    slug = row.get("slug")
    if domain is not None and isinstance(slug, str):
        expected = f"{PATH_PREFIX}{domain_path_segment(domain)}/{slug}"
        if path != expected:
            return False, f"path {path} does not match domain and slug (expected {expected})"
    return True, f"path {path} is well-formed"


def _check_slug_format(row: dict) -> tuple[bool, str]:
    slug = row.get("slug")
    if isinstance(slug, str) and re.fullmatch(SLUG_PATTERN, slug):
        return True, "slug is well-formed"
    return False, f"slug must match {SLUG_PATTERN}"


def _check_title(row: dict) -> tuple[bool, str]:
    return (True, "title present") if _nonblank_str(row.get("title")) else (False, "title is blank")


def _check_description(row: dict) -> tuple[bool, str]:
    if _nonblank_str(row.get("description")):
        return True, "description present"
    return False, "description is missing or blank"


def _check_parameters(row: dict) -> tuple[bool, str]:
    params = row.get("parameters")
    if not isinstance(params, list):
        return False, "parameters must be a list"
    names: list[str] = []
    for i, param in enumerate(params):
        try:
            names.append(ParameterDefinition.model_validate(param).name)
        except ValidationError as exc:
            return False, f"parameter {i} is invalid: {exc.errors()[0]['msg']}"
    if len(set(names)) != len(names):
        return False, "duplicate parameter name"
    domain = _domain(row)
    if domain is not None:
        required = [p["name"] for p in get_default_parameters(domain) if p.get("required")]
        missing = [n for n in required if n not in names]
        if missing:
            return False, f"{domain.value} endpoints require parameter(s): {', '.join(missing)}"
    return True, f"{len(names)} parameter(s) valid"


def _check_response_schema(row: dict) -> tuple[bool, str]:
    schema = row.get("response_schema")
    if isinstance(schema, dict) and schema:
        return True, "response_schema is a non-empty object"
    return False, "response_schema must be a non-empty object"


def _check_hash(row: dict) -> tuple[bool, str]:
    value = row.get("endpoint_hash")
    if not isinstance(value, str) or not _SHA256.fullmatch(value):
        return False, "endpoint_hash must be 64 lowercase hex characters"
    record, _ = _parse_record(row)
    if record is None:
        return False, "endpoint_hash could not be recomputed: row fails schema validation"
    if compute_endpoint_hash(record) != value:
        return False, "endpoint_hash does not match the stored spec (spec changed after generation)"
    return True, "endpoint_hash matches the spec"


def _check_provenance(row: dict) -> tuple[bool, str]:
    sources = row.get("provenance_source_ids")
    if not isinstance(sources, list) or not sources:
        return False, "provenance_source_ids is empty"
    dataset_id = row.get("provenance_dataset_id")
    if not dataset_id:
        return False, "provenance_dataset_id is not set"
    if str(dataset_id) != str(row.get("dataset_id")):
        return False, "provenance_dataset_id does not equal dataset_id"
    return True, f"provenance traces to dataset and {len(sources)} source(s)"


def _check_domain(row: dict) -> tuple[bool, str]:
    domain = _domain(row)
    if domain is None:
        return False, f"domain {row.get('domain')!r} is not a known DomainClassification"
    if domain in _UNPUBLISHABLE_DOMAINS:
        return False, f"domain {domain.value} cannot be published"
    return True, f"domain {domain.value} supported"


def _check_pricing(row: dict) -> tuple[bool, str]:
    tier, price = _tier(row), _price(row)
    if tier is None:
        return False, f"pricing_tier {row.get('pricing_tier')!r} is not a known tier"
    if price is None:
        return False, "price_usdc is not a number"
    floor = TIER_PRICES[tier]
    if price < floor:
        return False, f"price_usdc {price} is below the {tier.value} floor {floor}"
    return True, f"price_usdc {price} >= {tier.value} floor {floor}"


def _check_t5(row: dict) -> tuple[bool, str]:
    if _tier(row) == PricingTier.T5 and row.get("cultural_sovereignty") is not True:
        return False, "pricing tier T5 requires cultural_sovereignty = True"
    return True, "sovereignty flag consistent with tier"


def _check_price_positive(row: dict) -> tuple[bool, str]:
    price = _price(row)
    if price is None or price <= 0:
        return False, "price_usdc must be greater than 0"
    return True, "price_usdc is positive"


def _check_record_schema(row: dict) -> tuple[bool, str]:
    record, error = _parse_record(row)
    return (True, "row passes strict schema") if record is not None else (False, error)


_CHECKS: dict[str, CheckFn] = {
    "path_format": _check_path_format,
    "slug_format": _check_slug_format,
    "title_not_blank": _check_title,
    "description_present": _check_description,
    "parameters_valid": _check_parameters,
    "response_schema_valid": _check_response_schema,
    "hash_present": _check_hash,
    "provenance_complete": _check_provenance,
    "domain_supported": _check_domain,
    "pricing_consistent": _check_pricing,
    "t5_sovereignty_check": _check_t5,
    "price_usdc_positive": _check_price_positive,
    "record_schema_valid": _check_record_schema,
}
# Check ids in report order. Every check runs on every validation.
VALIDATION_CHECKS: list[str] = list(_CHECKS)


def run_checks(row: dict) -> list[ValidationCheckResult]:
    """Run every check on a raw endpoint row, in VALIDATION_CHECKS order. Never short-circuits."""
    if not isinstance(row, dict):
        row = {}
    results = []
    for check_id, fn in _CHECKS.items():
        try:
            passed, message = fn(row)
        except Exception as exc:  # noqa: BLE001 — a check must never abort the report
            passed, message = False, f"check raised {type(exc).__name__}"
        results.append(ValidationCheckResult(check_id=check_id, passed=passed, message=message))
    return results


def validate_endpoint(endpoint_id: UUID) -> EndpointValidationOutput:
    """
    Load endpoint from DB. Run all checks. Return EndpointValidationOutput.
    Does NOT write to DB — caller decides whether to proceed.
    All checks run regardless of earlier failures (collect all errors).
    """
    row = db.fetch_endpoint(str(endpoint_id))
    checks = run_checks(row)
    return EndpointValidationOutput(
        endpoint_id=endpoint_id,
        passed=all(c.passed for c in checks),
        checks=checks,
        validated_at=datetime.now(timezone.utc),
    )
