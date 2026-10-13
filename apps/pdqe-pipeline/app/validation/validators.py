"""
PDQE Stage 05 — Deterministic Validators.

Each validator checks one machine-enforceable constraint. Validators never
assess scientific quality or subjective data value (P10 — SBP makes no
quality judgments). Every validator has the same signature:

    validator(extraction: dict, source: dict) -> ValidatorResult

where `extraction` is a pdqe.extractions row and `source` is a pdqe.sources
row. Both are treated as untrusted data (P9): validators read them, never
execute or interpret them.

Bump CURRENT_VALIDATOR_VERSION whenever a validator is added, removed, or its
pass/fail logic changes — it is written to every pdqe.validations row.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterator
from typing import Any
from urllib.parse import urlparse

from app.validation.schemas import ValidatorResult

CURRENT_VALIDATOR_VERSION = "v1.1"

# Licence statuses (pdqe.licence_status, migration 20261008000002) that a
# deterministic check may treat as confirmed. UNKNOWN is not approval;
# REVIEW_REQUIRED needs human sign-off by definition; EXCLUDED is handled by
# validate_licence_not_excluded and always rejects.
CONFIRMED_LICENCE_STATUSES = frozenset({"CLEAR", "RESTRICTED"})

_MAX_REASON_ECHO = 80

Validator = Callable[[dict, dict], ValidatorResult]


def _result(validator_id: str, passed: bool, reason: str) -> ValidatorResult:
    return ValidatorResult(validator_id=validator_id, passed=passed, reason=reason)


def _validated_output(extraction: dict) -> dict:
    value = extraction.get("validated_output")
    return value if isinstance(value, dict) else {}


def validate_extraction_status(extraction: dict, source: dict) -> ValidatorResult:
    """Extraction status must be VALIDATED (set by the Stage 03 Layer 4 gate)."""
    status = extraction.get("status")
    if status != "VALIDATED":
        return _result(
            "extraction_status", False, f"Extraction status is '{status}', expected 'VALIDATED'"
        )
    return _result("extraction_status", True, "Extraction status: VALIDATED")


def validate_extraction_schema(extraction: dict, source: dict) -> ValidatorResult:
    """Extraction must carry a non-empty validated_output dict (Stage 03 P9 output)."""
    validated = extraction.get("validated_output")
    if not isinstance(validated, dict):
        return _result(
            "extraction_schema",
            False,
            "validated_output is missing or not an object — Stage 03 P9 gate may have failed",
        )
    if not validated:
        return _result("extraction_schema", False, "validated_output is an empty object")
    return _result("extraction_schema", True, f"validated_output has {len(validated)} fields")


# Belt-and-braces after Stage 02's five-layer gate and Stage 03's Layer 4
# schema. Patterns are word-bounded and deliberately narrow: a match downgrades
# AUTO_APPROVE to REVIEW (human eyes), so false positives cost review time,
# not data — but an over-broad pattern (e.g. bare "act as") would flag
# ordinary prose like "mangroves act as a buffer" on every source.
_INJECTION_PATTERNS: tuple[str, ...] = (
    r"\bignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+instructions\b",
    r"\bignore\s+all\s+instructions\b",
    r"\bdisregard\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+instructions\b",
    r"\byou\s+are\s+now\b",
    r"\bact\s+as\s+(?:an?\s+|the\s+)?(?:ai|assistant|system|chatbot|language\s+model)\b",
    r"\bsystem\s+prompt\b",
    r"<\|\s*(?:system|im_start|im_end)\s*\|>",
    r"\[/?inst\]",
    r"###\s*instruction",
)
_COMPILED_INJECTION_PATTERNS = tuple(re.compile(p, re.IGNORECASE) for p in _INJECTION_PATTERNS)

# Zero-width / invisible characters an attacker could use to split a marker
# ("ig​nore previous instructions") past a plain substring match.
_INVISIBLE_CHARS = re.compile("[­​-‏⁠-⁤﻿]")


def _iter_strings(value: Any, depth: int = 0) -> Iterator[str]:
    """Yield every string nested anywhere in a JSON-like value (keys and values)."""
    if depth > 20:  # validated_output is shallow; bound recursion on hostile input
        return
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for k, v in value.items():
            if isinstance(k, str):
                yield k
            yield from _iter_strings(v, depth + 1)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from _iter_strings(item, depth + 1)


def validate_no_prompt_injection_markers(extraction: dict, source: dict) -> ValidatorResult:
    """
    Scan every string in validated_output (including nested variables, tables
    and provenance quotes) for common prompt-injection markers.
    """
    text = " ".join(_iter_strings(_validated_output(extraction)))
    text = _INVISIBLE_CHARS.sub("", text)
    text = re.sub(r"\s+", " ", text)
    for pattern in _COMPILED_INJECTION_PATTERNS:
        if pattern.search(text):
            # Echo the pattern, never the matched (attacker-controlled) text.
            return _result(
                "no_prompt_injection", False, f"Possible injection marker matched pattern: {pattern.pattern}"
            )
    return _result("no_prompt_injection", True, "No injection markers detected")


def validate_provenance_present(extraction: dict, source: dict) -> ValidatorResult:
    """Extraction must carry a non-empty provenance_map (Stage 03 provenance requirement)."""
    provenance = extraction.get("provenance_map")
    if not isinstance(provenance, dict) or not provenance:
        return _result("provenance_present", False, "provenance_map is missing or empty")
    return _result("provenance_present", True, f"provenance_map has {len(provenance)} entries")


def validate_title_present(extraction: dict, source: dict) -> ValidatorResult:
    """validated_output.title must be a non-blank string."""
    title = _validated_output(extraction).get("title")
    if not isinstance(title, str) or not title.strip():
        return _result("title_present", False, "Title missing or empty")
    return _result("title_present", True, f"Title present: '{title.strip()[:_MAX_REASON_ECHO]}'")


def validate_source_url(extraction: dict, source: dict) -> ValidatorResult:
    """
    The source must have a traceable origin.

    pdqe.sources.source_url is the canonical URL (ExtractionOutput has no URL
    field). It is NULL by design for MANUAL_UPLOAD sources, whose origin is
    the ingestion event + content hash instead. Every other acquisition
    method must carry a parseable http(s) URL with a host.
    """
    url = source.get("source_url")
    method = source.get("acquisition_method")

    if url is None or (isinstance(url, str) and not url.strip()):
        if method == "MANUAL_UPLOAD":
            return _result(
                "source_url", True, "No source URL — permitted for MANUAL_UPLOAD (origin is the ingestion record)"
            )
        return _result("source_url", False, f"No source URL for acquisition_method '{method}'")

    if not isinstance(url, str):
        return _result("source_url", False, "source_url is not a string")

    try:
        parsed = urlparse(url.strip())
    except ValueError as exc:
        return _result("source_url", False, f"URL parse error: {exc}")

    if parsed.scheme not in ("http", "https"):
        return _result("source_url", False, f"URL scheme '{parsed.scheme}' is not http/https")
    if not parsed.hostname:
        return _result("source_url", False, "URL has no host")
    return _result("source_url", True, f"URL valid: {url.strip()[:_MAX_REASON_ECHO]}")


def validate_licence_not_excluded(extraction: dict, source: dict) -> ValidatorResult:
    """Licence status must not be EXCLUDED. A failure here always rejects (see engine)."""
    status = source.get("licence_status") or "UNKNOWN"
    if status == "EXCLUDED":
        return _result(
            "licence_not_excluded", False, "Licence status is EXCLUDED — this source must not be processed"
        )
    return _result("licence_not_excluded", True, f"Licence status: {status}")


def validate_licence_confirmed(extraction: dict, source: dict) -> ValidatorResult:
    """
    Licence must be confirmed (CLEAR or RESTRICTED). "Unknown is not approval":
    UNKNOWN fails, and REVIEW_REQUIRED fails because it requires human sign-off
    by definition. A failure routes to REVIEW, not rejection.
    """
    status = source.get("licence_status") or "UNKNOWN"
    if status in CONFIRMED_LICENCE_STATUSES:
        return _result("licence_confirmed", True, f"Licence status confirmed: {status}")
    if status == "UNKNOWN":
        return _result(
            "licence_confirmed", False, "Licence status UNKNOWN — 'Unknown is not approval'. Requires human review."
        )
    return _result("licence_confirmed", False, f"Licence status {status} requires human sign-off")


# ── v1.1 — Stage 03/04 combined-output routing consistency validators ────────
# Session: PDQE now runs a combined extraction + qualification pass (Pass A +
# Pass B) in one Claude call, so validated_output can carry the model's own
# routing_decision/jev_dimensions/jev_scores/security_flags/domain alongside
# the standard extraction fields. Same "never rely on a model to validate its
# own output" principle as the rest of this file: these four check that the
# model's self-reported routing claim is actually consistent with its own
# other self-reported fields, never the other way around. Each is backwards
# compatible — an extraction predating these fields (none of them present)
# passes rather than failing on a field that was never there to check.


def validate_jev_score_arithmetic(extraction: dict, source: dict) -> ValidatorResult:
    """
    jev_scores.total must equal the sum of every dimension's "score" in
    jev_dimensions. Skips (passes) when either field is absent.
    """
    validated = _validated_output(extraction)
    jev_dimensions = validated.get("jev_dimensions")
    jev_scores = validated.get("jev_scores")
    if not isinstance(jev_dimensions, dict) or not isinstance(jev_scores, dict):
        return _result("jev_score_arithmetic", True, "jev_dimensions/jev_scores absent — skipped")

    try:
        computed_total = sum(dim["score"] for dim in jev_dimensions.values())
    except (KeyError, TypeError) as exc:
        return _result("jev_score_arithmetic", False, f"Malformed jev_dimensions: {exc}")

    reported_total = jev_scores.get("total")
    if reported_total is None:
        return _result("jev_score_arithmetic", False, "jev_scores.total is missing")
    if abs(computed_total - reported_total) > 1e-9:
        return _result(
            "jev_score_arithmetic",
            False,
            f"jev_scores.total ({reported_total}) does not equal sum of dimension scores ({computed_total})",
        )
    return _result("jev_score_arithmetic", True, f"jev_scores.total matches sum of dimension scores ({computed_total})")


def validate_security_flags_routing_consistency(extraction: dict, source: dict) -> ValidatorResult:
    """An extraction with any security_flags must never self-report AUTO_APPROVE."""
    validated = _validated_output(extraction)
    security_flags = validated.get("security_flags") or []
    routing_decision = validated.get("routing_decision")
    if security_flags and routing_decision == "AUTO_APPROVE":
        return _result(
            "security_flags_routing_consistency",
            False,
            f"security_flags present ({len(security_flags)}) but routing_decision is AUTO_APPROVE",
        )
    return _result("security_flags_routing_consistency", True, "No AUTO_APPROVE/security_flags conflict")


def validate_culture_heritage_routing(extraction: dict, source: dict) -> ValidatorResult:
    """CULTURE_HERITAGE domain must always require human review, never AUTO_APPROVE."""
    validated = _validated_output(extraction)
    domain = validated.get("domain")
    routing_decision = validated.get("routing_decision")
    if domain == "CULTURE_HERITAGE" and routing_decision == "AUTO_APPROVE":
        return _result(
            "culture_heritage_routing",
            False,
            "domain is CULTURE_HERITAGE but routing_decision is AUTO_APPROVE — always requires human review",
        )
    return _result("culture_heritage_routing", True, "No CULTURE_HERITAGE/AUTO_APPROVE conflict")


def validate_licence_risk_routing(extraction: dict, source: dict) -> ValidatorResult:
    """
    A licence.risk_score of community_controlled/restricted_proprietary/unknown
    must never self-report AUTO_APPROVE. Passes (skipped) when risk_score is
    absent.
    """
    validated = _validated_output(extraction)
    licence = validated.get("licence")
    risk_score = licence.get("risk_score") if isinstance(licence, dict) else None
    if risk_score is None:
        return _result("licence_risk_routing", True, "licence.risk_score absent — skipped")

    routing_decision = validated.get("routing_decision")
    if risk_score in ("community_controlled", "restricted_proprietary", "unknown") and routing_decision == "AUTO_APPROVE":
        return _result(
            "licence_risk_routing",
            False,
            f"licence.risk_score is '{risk_score}' but routing_decision is AUTO_APPROVE",
        )
    return _result("licence_risk_routing", True, f"licence.risk_score '{risk_score}' compatible with routing_decision")


# Registry — every validator runs on every non-REJECT path; none short-circuit,
# so pdqe.validations always holds the full picture for the reviewer.
VALIDATOR_REGISTRY: tuple[Validator, ...] = (
    validate_extraction_status,
    validate_extraction_schema,
    validate_no_prompt_injection_markers,
    validate_provenance_present,
    validate_title_present,
    validate_source_url,
    validate_licence_not_excluded,
    validate_licence_confirmed,
    validate_jev_score_arithmetic,
    validate_security_flags_routing_consistency,
    validate_culture_heritage_routing,
    validate_licence_risk_routing,
)
