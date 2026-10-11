"""
PDQE Stage 08 — Endpoint Generation tests.

Covers:
  1. Slug and path generation
  2. Pricing tier assignment
  3. Endpoint spec generation
  4. P9 and safety — strict input, nothing executable
  5. Cultural sovereignty and custom pricing
  6. DB writes and lifecycle transitions

No model is called anywhere in Stage 08. All Supabase access is mocked — no
live DB connection.
"""

from __future__ import annotations

import copy
import re
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from app.endpoint import supabase_client as db
from app.endpoint.generator import (
    build_slug,
    compute_endpoint_hash,
    generate_endpoint,
    slugify,
)
from app.endpoint.schemas import (
    TIER_PRICES,
    EndpointRecord,
    EndpointSpec,
    EndpointStatus,
    ParameterDefinition,
    PricingTier,
)
from app.endpoint.templates import (
    assign_pricing_tier,
    build_query_examples,
    get_default_parameters,
    get_default_response_schema,
    get_path_template,
)

# ── Fixtures ──────────────────────────────────────────────────────────────────

SOURCE_ID = str(uuid4())
SECOND_SOURCE_ID = str(uuid4())
DATASET_ID = str(uuid4())
COLLECTION_ID = str(uuid4())
VALIDATION_ID = str(uuid4())
ASSESSMENT_ID = str(uuid4())
EXTRACTION_ID = str(uuid4())
ENDPOINT_ID = str(uuid4())
NOW = datetime(2026, 10, 12, tzinfo=timezone.utc).isoformat()

DATASET: dict = {
    "dataset_id": DATASET_ID,
    "source_ids": [SOURCE_ID],
    "primary_source_id": SOURCE_ID,
    "extraction_ids": [EXTRACTION_ID],
    "domain": "FISHERIES",
    "title": "Samoa Tuna Catch",
    "description": "Annual tuna catch by species for Samoa.",
    "geography_scope": ["Samoa"],
    "time_period_start": "2015",
    "time_period_end": "2024",
    "licence_status": "CLEAR",
    "licence_url": "https://creativecommons.org/licenses/by/4.0/",
    "version": 1,
    "dataset_hash": "b" * 64,
    "metadata": {},
    "lifecycle_state": "COLLECTION_LINKED",
    "created_at": NOW,
    "updated_at": NOW,
}

SOURCE: dict = {
    "source_id": SOURCE_ID,
    "lifecycle_state": "COLLECTION_LINKED",
    "source_type": "API_ENDPOINT",
    "licence_status": "CLEAR",
}

VALIDATION: dict = {
    "id": VALIDATION_ID,
    "source_id": SOURCE_ID,
    "assessment_id": ASSESSMENT_ID,
    "outcome": "VALIDATED",
    "validated_at": NOW,
}

ASSESSMENT: dict = {
    "id": ASSESSMENT_ID,
    "source_id": SOURCE_ID,
    "extraction_id": EXTRACTION_ID,
    "completeness_score": 4,
    "domain_classification": "FISHERIES",
}


def _echo_insert(row: dict) -> dict:
    """Mimic the DB: assign id/status/timestamps; NUMERIC comes back as a string at scale 4."""
    return {
        **row,
        "price_usdc": f"{Decimal(str(row['price_usdc'])):.4f}",
        "endpoint_id": ENDPOINT_ID,
        "provider_wallet": None,
        "status": "DRAFT",
        "generated_at": NOW,
        "updated_at": NOW,
    }


@pytest.fixture
def mock_db():
    with (
        patch.object(db, "fetch_dataset", return_value=copy.deepcopy(DATASET)) as fds,
        patch.object(db, "fetch_source", return_value=copy.deepcopy(SOURCE)) as fs,
        patch.object(db, "fetch_latest_validation", return_value=copy.deepcopy(VALIDATION)) as fv,
        patch.object(db, "fetch_assessment", return_value=copy.deepcopy(ASSESSMENT)) as fa,
        patch.object(db, "list_dataset_collection_ids", return_value=[COLLECTION_ID]) as lc,
        patch.object(db, "fetch_endpoint_for_dataset", return_value=None) as fe,
        patch.object(db, "insert_endpoint", side_effect=_echo_insert) as ins,
        patch.object(db, "call_transition") as rpc,
    ):
        yield {
            "fetch_dataset": fds,
            "fetch_source": fs,
            "fetch_latest_validation": fv,
            "fetch_assessment": fa,
            "list_dataset_collection_ids": lc,
            "fetch_endpoint_for_dataset": fe,
            "insert_endpoint": ins,
            "call_transition": rpc,
        }


def _spec_kwargs(**overrides) -> dict:
    """A valid EndpointSpec payload (hash format-valid; integrity is checked separately)."""
    kwargs = {
        "dataset_id": DATASET_ID,
        "collection_id": COLLECTION_ID,
        "path": "/pacific/fisheries/samoa-tuna-catch",
        "slug": "samoa-tuna-catch",
        "title": "Samoa Tuna Catch",
        "description": "Annual tuna catch.",
        "domain": "FISHERIES",
        "pricing_tier": "T1",
        "price_usdc": Decimal("0.01"),
        "cultural_sovereignty": False,
        "response_schema": {"type": "object"},
        "parameters": [{"name": "year", "type": "integer", "description": "Year."}],
        "query_examples": [],
        "endpoint_hash": "c" * 64,
        "provenance_dataset_id": DATASET_ID,
        "provenance_source_ids": [SOURCE_ID],
    }
    kwargs.update(overrides)
    return kwargs


# ── Group 1 — Slug and path generation ────────────────────────────────────────


def test_slugify_converts_title_to_slug():
    assert slugify("Samoa Tuna Catch 2024") == "samoa-tuna-catch-2024"


def test_slugify_removes_special_chars():
    assert slugify("  Tonga: Fish & Chips!! (Ōtai) -- ") == "tonga-fish-chips-otai"
    assert slugify("'; DROP TABLE pdqe.endpoints; --") == "drop-table-pdqe-endpoints"


def test_slugify_max_length_64():
    slug = slugify("pacific " * 40)
    assert len(slug) <= 64
    assert not slug.endswith("-")
    # The dataset-suffixed slug also fits and stays valid.
    full = build_slug("pacific " * 40, UUID(DATASET_ID))
    assert len(full) <= 64
    assert re.fullmatch(r"^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$", full)


def test_path_starts_with_pacific():
    assert get_path_template("CLIMATE", "rainfall-anomaly").startswith("/pacific/")


def test_path_includes_domain_and_slug():
    assert get_path_template("FISHERIES", "samoa-tuna-catch") == "/pacific/fisheries/samoa-tuna-catch"
    assert get_path_template("NONE_OF_THE_ABOVE", "misc-data") == "/pacific/none-of-the-above/misc-data"


def test_health_path_template():
    assert get_path_template("HEALTH", "samoa-immunisation") == "/pacific/health/samoa-immunisation"


def test_health_default_parameters_validate():
    params = get_default_parameters("HEALTH")
    by_name = {p["name"]: p for p in params}
    assert by_name["year"]["type"] == "string" and by_name["year"]["required"] is True
    assert by_name["country"]["type"] == "string" and by_name["country"]["required"] is True
    assert by_name["indicator_type"]["enum_values"] == [
        "immunisation", "ncd_prevalence", "maternal_mortality", "hospital_capacity", "other",
    ]
    for p in params:
        ParameterDefinition(**p)


def test_health_response_record_shape():
    record = get_default_response_schema("HEALTH")["properties"]["data"]["items"]["properties"]
    assert record == {
        "country": {"type": "string"},
        "year": {"type": "integer"},
        "indicator": {"type": "string"},
        "value": {"type": "number"},
        "unit": {"type": "string"},
        "source": {"type": "string"},
    }


def test_health_query_examples_respect_required_params():
    path = "/pacific/health/samoa-immunisation"
    params = get_default_parameters("HEALTH")
    examples = build_query_examples(
        path, params, {"time_period_end": "2023", "geography_scope": ["Samoa"]}
    )
    assert examples == [
        {"description": "Filtered by country, year", "path": path,
         "params": {"year": "2023", "country": "Samoa"}},
    ]
    # Without a year or geography no example can satisfy the required params.
    assert build_query_examples(path, params, {}) == []


# ── Group 2 — Pricing tier assignment ─────────────────────────────────────────


def test_t1_assigned_to_single_source_validated():
    assert assign_pricing_tier(DATASET, ASSESSMENT, SOURCE) == (PricingTier.T1, False)


def test_t2_assigned_to_multi_source():
    dataset = {**DATASET, "source_ids": [SOURCE_ID, SECOND_SOURCE_ID]}
    assert assign_pricing_tier(dataset, ASSESSMENT, SOURCE) == (PricingTier.T2, False)


def test_t3_assigned_when_completeness_score_ge3():
    pdf = {**SOURCE, "source_type": "PDF_DOCUMENT"}
    assert assign_pricing_tier(DATASET, {**ASSESSMENT, "completeness_score": 3}, pdf) == (PricingTier.T3, False)
    # Below the threshold, or not PDF-extracted, it is not T3.
    assert assign_pricing_tier(DATASET, {**ASSESSMENT, "completeness_score": 2}, pdf)[0] == PricingTier.T1
    assert assign_pricing_tier(DATASET, {**ASSESSMENT, "completeness_score": 4}, SOURCE)[0] == PricingTier.T1


def test_t4_assigned_to_composite_multi_nation():
    dataset = {
        **DATASET,
        "source_ids": [SOURCE_ID, SECOND_SOURCE_ID],
        "geography_scope": ["Samoa", "Fiji", "Tonga"],
    }
    assert assign_pricing_tier(dataset, ASSESSMENT, SOURCE) == (PricingTier.T4, False)
    # Same composite in a non-T4 domain falls back to multi-source T2.
    assert assign_pricing_tier({**dataset, "domain": "CLIMATE"}, ASSESSMENT, SOURCE)[0] == PricingTier.T2


def test_t5_assigned_when_cultural_sovereignty_true():
    dataset = {**DATASET, "metadata": {"cultural_sovereignty": True}}
    assert assign_pricing_tier(dataset, ASSESSMENT, SOURCE) == (PricingTier.T5, True)
    # Only the JSON boolean true counts — a truthy string does not.
    assert assign_pricing_tier({**DATASET, "metadata": {"cultural_sovereignty": "yes"}}, ASSESSMENT, SOURCE)[0] == PricingTier.T1


def test_t5_takes_precedence_over_other_tiers():
    dataset = {
        **DATASET,
        "source_ids": [SOURCE_ID, SECOND_SOURCE_ID],
        "geography_scope": ["Samoa", "Fiji"],
        "metadata": {"cultural_sovereignty": True},
    }
    assert assign_pricing_tier(dataset, ASSESSMENT, SOURCE) == (PricingTier.T5, True)


def test_tier_price_matches_tier_price_map(mock_db):
    assert TIER_PRICES == {
        PricingTier.T0: Decimal("0.001"),
        PricingTier.T1: Decimal("0.01"),
        PricingTier.T2: Decimal("0.10"),
        PricingTier.T3: Decimal("0.50"),
        PricingTier.T4: Decimal("2.00"),
        PricingTier.T5: Decimal("5.00"),
    }
    mock_db["fetch_dataset"].return_value = {**DATASET, "source_ids": [SOURCE_ID, SECOND_SOURCE_ID]}
    record = generate_endpoint(UUID(DATASET_ID), write_to_db=False)
    assert record.pricing_tier == PricingTier.T2
    assert record.price_usdc == TIER_PRICES[PricingTier.T2]


# ── Group 3 — Endpoint spec generation ────────────────────────────────────────


def test_generate_returns_endpoint_record(mock_db):
    record = generate_endpoint(UUID(DATASET_ID))
    assert isinstance(record, EndpointRecord)
    assert str(record.endpoint_id) == ENDPOINT_ID
    assert record.status == EndpointStatus.DRAFT
    assert str(record.collection_id) == COLLECTION_ID
    assert record.title == DATASET["title"]
    assert [p.name for p in record.parameters] == ["year", "country", "species"]
    assert {"attribution", "data_currency", "provenance"} <= set(record.response_schema["required"])


def test_generate_not_collection_linked_raises(mock_db):
    mock_db["fetch_dataset"].return_value = {**DATASET, "lifecycle_state": "DATASET_CREATED"}
    with pytest.raises(ValueError, match="requires COLLECTION_LINKED"):
        generate_endpoint(UUID(DATASET_ID))

    mock_db["fetch_dataset"].return_value = copy.deepcopy(DATASET)
    mock_db["fetch_source"].return_value = {**SOURCE, "lifecycle_state": "APPROVED"}
    with pytest.raises(ValueError, match="requires COLLECTION_LINKED"):
        generate_endpoint(UUID(DATASET_ID))
    mock_db["insert_endpoint"].assert_not_called()


def test_generate_dataset_not_found_raises(mock_db):
    mock_db["fetch_dataset"].side_effect = ValueError(f"Dataset {DATASET_ID} not found in pdqe.datasets")
    with pytest.raises(ValueError, match="not found"):
        generate_endpoint(UUID(DATASET_ID))
    mock_db["insert_endpoint"].assert_not_called()


def test_spec_path_format_valid(mock_db):
    record = generate_endpoint(UUID(DATASET_ID), write_to_db=False)
    suffix = UUID(DATASET_ID).hex[:8]
    assert record.slug == f"samoa-tuna-catch-{suffix}"
    assert record.path == f"/pacific/fisheries/samoa-tuna-catch-{suffix}"


def test_spec_hash_is_sha256(mock_db):
    record = generate_endpoint(UUID(DATASET_ID), write_to_db=False)
    assert re.fullmatch(r"[0-9a-f]{64}", record.endpoint_hash)
    assert compute_endpoint_hash(record) == record.endpoint_hash


def test_spec_hash_deterministic(mock_db):
    first = generate_endpoint(UUID(DATASET_ID), write_to_db=False)
    second = generate_endpoint(UUID(DATASET_ID), write_to_db=False)
    assert first.endpoint_id != second.endpoint_id  # provisional ids differ
    assert first.endpoint_hash == second.endpoint_hash
    # Any change to a hashed field changes the hash.
    changed = first.model_copy(update={"price_usdc": Decimal("0.02")})
    assert compute_endpoint_hash(changed) != first.endpoint_hash


def test_provenance_source_ids_match_dataset(mock_db):
    mock_db["fetch_dataset"].return_value = {**DATASET, "source_ids": [SOURCE_ID, SECOND_SOURCE_ID]}
    record = generate_endpoint(UUID(DATASET_ID), write_to_db=False)
    assert [str(s) for s in record.provenance_source_ids] == [SOURCE_ID, SECOND_SOURCE_ID]
    assert str(record.provenance_dataset_id) == DATASET_ID
    assert str(record.dataset_id) == DATASET_ID


# ── Group 4 — P9 and safety ───────────────────────────────────────────────────


def test_p9_extra_fields_rejected_on_spec():
    EndpointSpec(**_spec_kwargs())  # baseline is valid
    with pytest.raises(ValidationError, match="Extra inputs"):
        EndpointSpec(**_spec_kwargs(handler="lambda: __import__('os').system('id')"))
    with pytest.raises(ValidationError, match="Extra inputs"):
        EndpointSpec(**_spec_kwargs(parameters=[{"name": "year", "type": "integer", "description": "Y", "default": "x"}]))


def test_malicious_slug_rejected():
    bad = "x'; drop table pdqe.endpoints; --"
    with pytest.raises(ValidationError):
        EndpointSpec(**_spec_kwargs(slug=bad, path=f"/pacific/fisheries/{bad}"))
    with pytest.raises(ValueError, match="slug"):
        get_path_template("FISHERIES", bad)


def test_malicious_path_rejected():
    for path in ("/admin/fisheries/samoa-tuna-catch", "/pacific/../admin", "/pacific/climate/samoa-tuna-catch"):
        with pytest.raises(ValidationError, match="path"):
            EndpointSpec(**_spec_kwargs(path=path))


def test_no_model_code_executed(mock_db):
    record = generate_endpoint(UUID(DATASET_ID), write_to_db=False)
    dumped = record.model_dump(mode="json")
    assert isinstance(dumped, dict)
    assert not callable(record)

    def _walk(value):
        assert not callable(value)
        if isinstance(value, dict):
            for v in value.values():
                _walk(v)
        elif isinstance(value, list):
            for v in value:
                _walk(v)
        else:
            assert value is None or isinstance(value, (str, int, float, bool))

    _walk(dumped)
    # A parameter type outside the closed set is refused.
    with pytest.raises(ValidationError):
        EndpointSpec(**_spec_kwargs(parameters=[{"name": "year", "type": "python", "description": "Y"}]))


def test_response_schema_is_dict_not_string():
    with pytest.raises(ValidationError):
        EndpointSpec(**_spec_kwargs(response_schema='{"type": "object"}'))
    assert isinstance(EndpointSpec(**_spec_kwargs()).response_schema, dict)


def test_parameters_is_list():
    with pytest.raises(ValidationError):
        EndpointSpec(**_spec_kwargs(parameters={"name": "year", "type": "integer", "description": "Y"}))
    assert isinstance(EndpointSpec(**_spec_kwargs()).parameters, list)


# ── Group 5 — Cultural sovereignty and custom pricing ─────────────────────────


def test_cultural_sovereignty_flag_set_on_t5_endpoint(mock_db):
    mock_db["fetch_dataset"].return_value = {**DATASET, "metadata": {"cultural_sovereignty": True}}
    record = generate_endpoint(UUID(DATASET_ID))
    assert record.pricing_tier == PricingTier.T5
    assert record.cultural_sovereignty is True
    inserted = mock_db["insert_endpoint"].call_args.args[0]
    assert inserted["cultural_sovereignty"] is True
    assert inserted["pricing_tier"] == "T5"


def test_t5_requires_cultural_sovereignty_flag():
    with pytest.raises(ValidationError, match="T5 requires cultural_sovereignty"):
        EndpointSpec(**_spec_kwargs(pricing_tier="T5", price_usdc=Decimal("5.00"), cultural_sovereignty=False))
    spec = EndpointSpec(**_spec_kwargs(pricing_tier="T5", price_usdc=Decimal("5.00"), cultural_sovereignty=True))
    assert spec.cultural_sovereignty is True


def test_price_usdc_defaults_to_tier_floor(mock_db):
    mock_db["fetch_dataset"].return_value = {**DATASET, "metadata": {"cultural_sovereignty": True}}
    record = generate_endpoint(UUID(DATASET_ID), write_to_db=False)
    assert record.price_usdc == Decimal("5.00")
    # A provider may price above the tier default, never below it.
    EndpointSpec(**_spec_kwargs(price_usdc=Decimal("0.25")))
    with pytest.raises(ValidationError, match="below the T1 default"):
        EndpointSpec(**_spec_kwargs(price_usdc=Decimal("0.005")))


# ── Group 6 — DB and transitions ──────────────────────────────────────────────


def test_generate_writes_to_db(mock_db):
    record = generate_endpoint(UUID(DATASET_ID))
    mock_db["insert_endpoint"].assert_called_once()
    row = mock_db["insert_endpoint"].call_args.args[0]
    assert row["dataset_id"] == DATASET_ID
    assert row["path"] == record.path
    assert row["endpoint_hash"] == record.endpoint_hash
    # The caller never supplies status or wallet — the DB forces DRAFT.
    assert "status" not in row and "provider_wallet" not in row


def test_generate_no_db_when_flag_false(mock_db):
    record = generate_endpoint(UUID(DATASET_ID), write_to_db=False)
    assert record.status == EndpointStatus.DRAFT
    mock_db["insert_endpoint"].assert_not_called()
    mock_db["call_transition"].assert_not_called()


def test_generate_calls_transition_rpc(mock_db):
    generate_endpoint(UUID(DATASET_ID))
    mock_db["call_transition"].assert_called_once_with(SOURCE_ID, ENDPOINT_ID)

    # Retry after a failed transition: existing endpoint, source still
    # COLLECTION_LINKED → only the transition re-runs.
    mock_db["call_transition"].reset_mock()
    mock_db["insert_endpoint"].reset_mock()
    existing = _echo_insert(generate_endpoint(UUID(DATASET_ID), write_to_db=False).model_dump(mode="json"))
    mock_db["fetch_endpoint_for_dataset"].return_value = existing
    generate_endpoint(UUID(DATASET_ID))
    mock_db["insert_endpoint"].assert_not_called()
    mock_db["call_transition"].assert_called_once_with(SOURCE_ID, ENDPOINT_ID)


def test_duplicate_dataset_endpoint_raises(mock_db):
    existing = _echo_insert(generate_endpoint(UUID(DATASET_ID), write_to_db=False).model_dump(mode="json"))
    mock_db["fetch_endpoint_for_dataset"].return_value = existing
    mock_db["fetch_source"].return_value = {**SOURCE, "lifecycle_state": "ENDPOINT_GENERATED"}
    with pytest.raises(ValueError, match="already has endpoint"):
        generate_endpoint(UUID(DATASET_ID))
    mock_db["insert_endpoint"].assert_not_called()
    mock_db["call_transition"].assert_not_called()

    # A concurrent insert losing the UNIQUE (dataset_id) race surfaces as ValueError too.
    mock_db["fetch_endpoint_for_dataset"].return_value = None
    mock_db["fetch_source"].return_value = copy.deepcopy(SOURCE)
    mock_db["insert_endpoint"].side_effect = ValueError("duplicate key value violates unique constraint")
    with pytest.raises(ValueError, match="duplicate key"):
        generate_endpoint(UUID(DATASET_ID))
    mock_db["call_transition"].assert_not_called()
