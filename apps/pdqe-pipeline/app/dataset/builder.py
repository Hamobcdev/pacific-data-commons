"""
PDQE Stage 07 — Dataset builder.

Build a dataset record from an approved source + its extraction and assessment.
Derives domain, title, licence from existing pipeline data.
Computes dataset_hash as SHA-256 of canonical JSON.

Provenance is derived, never caller-supplied: the source chain is
latest validation → the Jev assessment it was run against → that
assessment's extraction → every ingestion event that contributed to the
extraction. A caller may override descriptive fields (title, description,
geography, time period, licence URL, metadata) but never source_ids,
extraction_ids, domain or licence_status.

No model is called. P9: every row loaded from Supabase is untrusted data and
reaches pdqe.datasets only through the strict DatasetDraft schema.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Optional
from uuid import UUID

from pydantic import ValidationError

from app.dataset import supabase_client as db
from app.dataset.schemas import DatasetCreate, DatasetDraft
from app.review.schemas import LicenceStatus

logger = logging.getLogger(__name__)

# Bumped whenever the set of hashed fields or their canonical form changes —
# stored inside the hashed payload so a hash always names its own recipe.
DATASET_HASH_VERSION = "pdqe-dataset-hash-v1"

_APPROVED = "APPROVED"
_ACCEPTED_VALIDATION_OUTCOMES = ("VALIDATED", "REVIEW")


def canonical_json(payload: dict[str, Any]) -> str:
    """
    Canonical serialisation (CLAUDE.md §10): keys sorted, no whitespace,
    UTF-8 (non-ASCII kept as-is rather than \\u-escaped).
    """
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_dataset_hash(
    *,
    source_ids: list[str],
    extraction_ids: list[str],
    domain: str,
    title: str,
    licence_status: str,
    geography_scope: list[str],
) -> str:
    """
    SHA-256 (lowercase hex) of the dataset's canonical JSON. Lists are sorted
    so the hash depends on the set of contributors, not on load order.
    """
    canonical = {
        "hash_version": DATASET_HASH_VERSION,
        "source_ids": sorted(str(s) for s in source_ids),
        "extraction_ids": sorted(str(e) for e in extraction_ids),
        "domain": domain,
        "title": title,
        "licence_status": licence_status,
        "geography_scope": sorted(geography_scope),
    }
    return hashlib.sha256(canonical_json(canonical).encode("utf-8")).hexdigest()


def _dedupe(values: list[str]) -> list[str]:
    out: list[str] = []
    for v in values:
        if v not in out:
            out.append(v)
    return out


def _string_list(value: Any) -> list[str]:
    if not value:
        return []
    if not isinstance(value, list):
        raise ValueError("expected a list of strings")
    return [str(v).strip() for v in value if str(v).strip()]


def build_dataset(source_id: UUID, overrides: Optional[DatasetCreate] = None) -> DatasetDraft:
    """
    Derive a DatasetDraft for an APPROVED source.

    Raises ValueError when the source/validation/assessment/extraction is
    missing or mismatched, the source is not APPROVED, or its licence is
    EXCLUDED or UNKNOWN.
    """
    sid = str(source_id)
    if overrides is not None and str(overrides.source_id) != sid:
        raise ValueError(f"Body source_id {overrides.source_id} does not match path source_id {sid}")

    source = db.fetch_source(sid)
    state = source.get("lifecycle_state")
    if state != _APPROVED:
        raise ValueError(f"Source {sid} is in state '{state}', Stage 07 requires APPROVED")

    licence = source.get("licence_status")
    if licence == LicenceStatus.EXCLUDED.value:
        raise ValueError(f"Source {sid} licence_status is EXCLUDED — it can never become a dataset")
    if licence == LicenceStatus.UNKNOWN.value:
        raise ValueError(f"Source {sid} licence_status is UNKNOWN — unknown is not approval")

    validation = db.fetch_latest_validation(sid)
    if validation.get("outcome") not in _ACCEPTED_VALIDATION_OUTCOMES:
        raise ValueError(
            f"Latest validation {validation.get('id')} for source {sid} has outcome "
            f"'{validation.get('outcome')}', expected VALIDATED or REVIEW"
        )

    # The assessment the approving validation was actually run against — not
    # merely the newest one.
    assessment = db.fetch_assessment(str(validation["assessment_id"]))
    if str(assessment.get("source_id")) != sid:
        raise ValueError(f"Assessment {assessment.get('id')} does not belong to source {sid}")

    extraction_id = str(assessment["extraction_id"])
    extraction = db.fetch_extraction(extraction_id)
    if str(extraction.get("source_id")) != sid:
        raise ValueError(f"Extraction {extraction_id} does not belong to source {sid}")
    if extraction.get("status") != "VALIDATED":
        raise ValueError(
            f"Extraction {extraction_id} has status '{extraction.get('status')}', expected VALIDATED"
        )

    # Every contributing source stays traceable; the primary source comes first.
    contributing = db.fetch_ingestion_source_ids(
        [str(i) for i in (extraction.get("contributing_ingestion_ids") or [])]
    )
    source_ids = _dedupe([sid, *contributing])
    extraction_ids = [extraction_id]

    try:
        derived_geography = _string_list(extraction.get("geographic_scope")) or _string_list(
            source.get("geographic_scope")
        )
    except ValueError as exc:
        raise ValueError(f"Source {sid} has malformed geographic_scope: {exc}") from exc

    derived_title = (source.get("title") or "").strip() or (source.get("source_url") or "").strip()
    if not derived_title:
        raise ValueError(f"Source {sid} has neither a title nor a source URL to name the dataset")

    if overrides is not None:
        title = overrides.title
        description = overrides.description
        geography = overrides.geography_scope or derived_geography
        time_period_start = overrides.time_period_start
        time_period_end = overrides.time_period_end
        licence_url = overrides.licence_url or source.get("licence_url") or extraction.get("licence_url")
        metadata = overrides.metadata
    else:
        title = derived_title
        description = source.get("description")
        geography = derived_geography
        time_period_start = None
        time_period_end = None
        licence_url = source.get("licence_url") or extraction.get("licence_url")
        metadata = {}

    domain = assessment.get("domain_classification")
    dataset_hash = compute_dataset_hash(
        source_ids=source_ids,
        extraction_ids=extraction_ids,
        domain=str(domain),
        title=title,
        licence_status=str(licence),
        geography_scope=geography,
    )

    try:
        draft = DatasetDraft(
            source_ids=source_ids,
            primary_source_id=sid,
            extraction_ids=extraction_ids,
            domain=domain,
            title=title,
            description=description,
            geography_scope=geography,
            time_period_start=time_period_start,
            time_period_end=time_period_end,
            licence_status=licence,
            licence_url=licence_url,
            dataset_hash=dataset_hash,
            metadata=metadata,
        )
    except ValidationError as exc:
        raise ValueError(f"Dataset for source {sid} failed schema validation: {exc}") from exc

    logger.info(
        "Built dataset draft for source %s: %d source(s), extraction %s, hash %s",
        sid, len(source_ids), extraction_id, dataset_hash,
    )
    return draft
