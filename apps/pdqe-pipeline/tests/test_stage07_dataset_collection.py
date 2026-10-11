"""
PDQE Stage 07 — Dataset and Collection Model tests.

Covers:
  1. Dataset builder — provenance derivation, state/licence gates, hashing
  2. Dataset creation — DB write, no-write flag, transition RPC, versioning
  3. Collection management — create, list, get
  4. Dataset-collection linking — DB write, transition, idempotency
  5. P9 + provenance — strict input, provenance never lost, licence gates

No model is called anywhere in Stage 07. All Supabase access is mocked — no
live DB connection.
"""

from __future__ import annotations

import copy
import re
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from app.dataset import supabase_client as db
from app.dataset.builder import build_dataset, compute_dataset_hash
from app.dataset.manager import (
    create_collection,
    create_dataset,
    get_dataset,
    link_dataset_to_collection,
    list_collection_datasets,
)
from app.dataset.schemas import (
    CollectionCreate,
    CollectionRecord,
    DatasetCollectionLink,
    DatasetCreate,
    DatasetDraft,
    DatasetRecord,
)
from app.qualification.schemas import DomainClassification

MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "20261012000003_pdqe_datasets_collections.sql"
)

# ── Fixtures ──────────────────────────────────────────────────────────────────

SOURCE_ID = str(uuid4())
SECOND_SOURCE_ID = str(uuid4())
VALIDATION_ID = str(uuid4())
ASSESSMENT_ID = str(uuid4())
EXTRACTION_ID = str(uuid4())
INGESTION_ID = str(uuid4())
SECOND_INGESTION_ID = str(uuid4())
DATASET_ID = str(uuid4())
COLLECTION_ID = str(uuid4())
NOW = datetime(2026, 10, 12, tzinfo=timezone.utc).isoformat()

SOURCE: dict = {
    "source_id": SOURCE_ID,
    "title": "SPC Tuna Fishery Yearbook 2024",
    "description": "Annual catch statistics for WCPFC tuna fisheries.",
    "source_url": "https://www.spc.int/fisheries/yearbook-2024.pdf",
    "lifecycle_state": "APPROVED",
    "licence_status": "CLEAR",
    "licence_url": "https://creativecommons.org/licenses/by/4.0/",
    "geographic_scope": ["Pacific"],
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
    "domain_classification": "FISHERIES",
}

EXTRACTION: dict = {
    "extraction_id": EXTRACTION_ID,
    "source_id": SOURCE_ID,
    "status": "VALIDATED",
    "title": "Tuna Fishery Yearbook",
    "geographic_scope": ["Samoa", "Fiji", "Tonga"],
    "licence_url": None,
    "contributing_ingestion_ids": [INGESTION_ID],
}

COLLECTION_ROW: dict = {
    "collection_id": COLLECTION_ID,
    "name": "Pacific Fisheries Collection",
    "description": "Samoa, Fiji and regional tuna statistics.",
    "domain": "FISHERIES",
    "geography_scope": ["Samoa", "Fiji"],
    "created_at": NOW,
    "updated_at": NOW,
}


def _dataset_row(**overrides) -> dict:
    """A pdqe.datasets row as the DB would return it for the default fixtures."""
    row = {
        "dataset_id": DATASET_ID,
        "source_ids": [SOURCE_ID],
        "primary_source_id": SOURCE_ID,
        "extraction_ids": [EXTRACTION_ID],
        "domain": "FISHERIES",
        "title": SOURCE["title"],
        "description": SOURCE["description"],
        "geography_scope": EXTRACTION["geographic_scope"],
        "time_period_start": None,
        "time_period_end": None,
        "licence_status": "CLEAR",
        "licence_url": SOURCE["licence_url"],
        "version": 1,
        "dataset_hash": "a" * 64,
        "metadata": {},
        "lifecycle_state": "DATASET_CREATED",
        "created_at": NOW,
        "updated_at": NOW,
    }
    row.update(overrides)
    return row


def _echo_insert(row: dict) -> dict:
    """Mimic the DB: assign id/state/timestamps to an inserted dataset row."""
    return {
        **row,
        "dataset_id": DATASET_ID,
        "lifecycle_state": "DATASET_CREATED",
        "created_at": NOW,
        "updated_at": NOW,
    }


@pytest.fixture
def mock_db():
    with (
        patch.object(db, "fetch_source", return_value=copy.deepcopy(SOURCE)) as fs,
        patch.object(db, "fetch_latest_validation", return_value=copy.deepcopy(VALIDATION)) as fv,
        patch.object(db, "fetch_assessment", return_value=copy.deepcopy(ASSESSMENT)) as fa,
        patch.object(db, "fetch_extraction", return_value=copy.deepcopy(EXTRACTION)) as fe,
        patch.object(db, "fetch_ingestion_source_ids", return_value=[SOURCE_ID]) as fi,
        patch.object(db, "list_datasets_for_source", return_value=[]) as lds,
        patch.object(db, "insert_dataset", side_effect=_echo_insert) as ins_ds,
        patch.object(db, "fetch_dataset", return_value=_dataset_row()) as fds,
        patch.object(db, "fetch_datasets", return_value=[_dataset_row()]) as fdss,
        patch.object(db, "insert_collection") as ins_col,
        patch.object(db, "fetch_collection", return_value=copy.deepcopy(COLLECTION_ROW)) as fcol,
        patch.object(
            db,
            "insert_link",
            return_value={"dataset_id": DATASET_ID, "collection_id": COLLECTION_ID, "linked_at": NOW},
        ) as ins_link,
        patch.object(db, "list_collection_dataset_ids", return_value=[DATASET_ID]) as lcids,
        patch.object(db, "call_transition") as rpc,
    ):
        ins_col.side_effect = lambda row: {
            **row,
            "collection_id": COLLECTION_ID,
            "created_at": NOW,
            "updated_at": NOW,
        }
        yield {
            "fetch_source": fs,
            "fetch_latest_validation": fv,
            "fetch_assessment": fa,
            "fetch_extraction": fe,
            "fetch_ingestion_source_ids": fi,
            "list_datasets_for_source": lds,
            "insert_dataset": ins_ds,
            "fetch_dataset": fds,
            "fetch_datasets": fdss,
            "insert_collection": ins_col,
            "fetch_collection": fcol,
            "insert_link": ins_link,
            "list_collection_dataset_ids": lcids,
            "call_transition": rpc,
        }


# ── Group 1 — Dataset builder ─────────────────────────────────────────────────


def test_build_dataset_from_approved_source(mock_db):
    draft = build_dataset(UUID(SOURCE_ID))
    assert isinstance(draft, DatasetDraft)
    assert str(draft.primary_source_id) == SOURCE_ID
    assert draft.title == SOURCE["title"]
    assert draft.geography_scope == ["Samoa", "Fiji", "Tonga"]
    assert draft.licence_status.value == "CLEAR"
    assert draft.licence_url == SOURCE["licence_url"]
    # Loaded the assessment the approving validation actually ran against.
    mock_db["fetch_assessment"].assert_called_once_with(ASSESSMENT_ID)
    mock_db["fetch_extraction"].assert_called_once_with(EXTRACTION_ID)


def test_build_dataset_not_approved_raises(mock_db):
    mock_db["fetch_source"].return_value = {**SOURCE, "lifecycle_state": "REVIEW"}
    with pytest.raises(ValueError, match="requires APPROVED"):
        build_dataset(UUID(SOURCE_ID))
    mock_db["fetch_latest_validation"].assert_not_called()


def test_build_dataset_excluded_licence_raises(mock_db):
    mock_db["fetch_source"].return_value = {**SOURCE, "licence_status": "EXCLUDED"}
    with pytest.raises(ValueError, match="EXCLUDED"):
        build_dataset(UUID(SOURCE_ID))


def test_build_dataset_unknown_licence_raises(mock_db):
    mock_db["fetch_source"].return_value = {**SOURCE, "licence_status": "UNKNOWN"}
    with pytest.raises(ValueError, match="UNKNOWN"):
        build_dataset(UUID(SOURCE_ID))


def test_dataset_hash_is_deterministic(mock_db):
    first = build_dataset(UUID(SOURCE_ID)).dataset_hash
    second = build_dataset(UUID(SOURCE_ID)).dataset_hash
    assert first == second
    assert re.fullmatch(r"[0-9a-f]{64}", first)
    # Order of contributors and geography does not change the hash.
    kwargs = dict(domain="FISHERIES", title="T", licence_status="CLEAR")
    a = compute_dataset_hash(source_ids=["s1", "s2"], extraction_ids=["e1"], geography_scope=["Fiji", "Samoa"], **kwargs)
    b = compute_dataset_hash(source_ids=["s2", "s1"], extraction_ids=["e1"], geography_scope=["Samoa", "Fiji"], **kwargs)
    assert a == b


def test_dataset_hash_changes_on_different_source(mock_db):
    original = build_dataset(UUID(SOURCE_ID)).dataset_hash

    other = str(uuid4())
    mock_db["fetch_source"].return_value = {**SOURCE, "source_id": other}
    mock_db["fetch_latest_validation"].return_value = {**VALIDATION, "source_id": other}
    mock_db["fetch_assessment"].return_value = {**ASSESSMENT, "source_id": other}
    mock_db["fetch_extraction"].return_value = {**EXTRACTION, "source_id": other}
    mock_db["fetch_ingestion_source_ids"].return_value = [other]

    assert build_dataset(UUID(other)).dataset_hash != original


def test_dataset_derives_domain_from_assessment(mock_db):
    mock_db["fetch_assessment"].return_value = {**ASSESSMENT, "domain_classification": "CLIMATE"}
    assert build_dataset(UUID(SOURCE_ID)).domain == DomainClassification.CLIMATE


# ── Group 2 — Dataset creation ────────────────────────────────────────────────


def test_create_dataset_returns_record(mock_db):
    record = create_dataset(UUID(SOURCE_ID))
    assert isinstance(record, DatasetRecord)
    assert str(record.dataset_id) == DATASET_ID
    assert record.version == 1
    assert record.lifecycle_state == "DATASET_CREATED"


def test_create_dataset_writes_to_db(mock_db):
    create_dataset(UUID(SOURCE_ID))
    mock_db["insert_dataset"].assert_called_once()
    row = mock_db["insert_dataset"].call_args.args[0]
    assert row["primary_source_id"] == SOURCE_ID
    assert row["source_ids"] == [SOURCE_ID]
    assert row["extraction_ids"] == [EXTRACTION_ID]
    assert row["domain"] == "FISHERIES"
    assert row["licence_status"] == "CLEAR"
    assert row["version"] == 1
    # DB-assigned fields are never sent.
    assert "dataset_id" not in row and "lifecycle_state" not in row


def test_create_dataset_no_db_when_flag_false(mock_db):
    record = create_dataset(UUID(SOURCE_ID), write_to_db=False)
    assert isinstance(record, DatasetRecord)
    mock_db["insert_dataset"].assert_not_called()
    mock_db["call_transition"].assert_not_called()


def test_create_dataset_calls_transition_rpc(mock_db):
    create_dataset(UUID(SOURCE_ID))
    mock_db["call_transition"].assert_called_once_with(
        "transition_to_dataset_created", SOURCE_ID, DATASET_ID
    )


def test_create_dataset_duplicate_increments_version(mock_db):
    mock_db["list_datasets_for_source"].return_value = [
        _dataset_row(dataset_id=str(uuid4()), version=2, dataset_hash="b" * 64),
        _dataset_row(dataset_id=str(uuid4()), version=1, dataset_hash="c" * 64),
    ]
    record = create_dataset(UUID(SOURCE_ID))
    assert mock_db["insert_dataset"].call_args.args[0]["version"] == 3
    assert record.version == 3


def test_create_dataset_source_not_found_raises(mock_db):
    mock_db["fetch_source"].side_effect = ValueError(f"Source {SOURCE_ID} not found in pdqe.sources")
    with pytest.raises(ValueError, match="not found"):
        create_dataset(UUID(SOURCE_ID))
    mock_db["insert_dataset"].assert_not_called()
    mock_db["call_transition"].assert_not_called()


# ── Group 3 — Collection management ───────────────────────────────────────────

COLLECTION_INPUT = CollectionCreate(
    name="Pacific Fisheries Collection",
    description="Samoa, Fiji and regional tuna statistics.",
    domain=DomainClassification.FISHERIES,
    geography_scope=["Samoa", "Fiji"],
)


def test_create_collection_returns_record(mock_db):
    record = create_collection(COLLECTION_INPUT)
    assert isinstance(record, CollectionRecord)
    assert str(record.collection_id) == COLLECTION_ID
    assert record.name == "Pacific Fisheries Collection"
    assert record.domain == DomainClassification.FISHERIES


def test_create_collection_writes_to_db(mock_db):
    create_collection(COLLECTION_INPUT)
    mock_db["insert_collection"].assert_called_once_with(
        {
            "name": "Pacific Fisheries Collection",
            "description": "Samoa, Fiji and regional tuna statistics.",
            "domain": "FISHERIES",
            "geography_scope": ["Samoa", "Fiji"],
        }
    )


def test_create_collection_no_db_when_flag_false(mock_db):
    record = create_collection(COLLECTION_INPUT, write_to_db=False)
    assert record.name == COLLECTION_INPUT.name
    mock_db["insert_collection"].assert_not_called()


def test_list_collection_datasets_returns_list(mock_db):
    records = list_collection_datasets(UUID(COLLECTION_ID))
    assert len(records) == 1 and isinstance(records[0], DatasetRecord)
    mock_db["list_collection_dataset_ids"].assert_called_once_with(COLLECTION_ID)
    mock_db["fetch_datasets"].assert_called_once_with([DATASET_ID])


def test_get_dataset_returns_record(mock_db):
    record = get_dataset(UUID(DATASET_ID))
    assert str(record.dataset_id) == DATASET_ID
    mock_db["fetch_dataset"].assert_called_once_with(DATASET_ID)


# ── Group 4 — Dataset-collection linking ──────────────────────────────────────


def test_link_dataset_to_collection_returns_link(mock_db):
    link = link_dataset_to_collection(UUID(DATASET_ID), UUID(COLLECTION_ID))
    assert isinstance(link, DatasetCollectionLink)
    assert str(link.dataset_id) == DATASET_ID
    assert str(link.collection_id) == COLLECTION_ID


def test_link_writes_to_db(mock_db):
    link_dataset_to_collection(UUID(DATASET_ID), UUID(COLLECTION_ID))
    mock_db["insert_link"].assert_called_once_with(DATASET_ID, COLLECTION_ID)


def test_link_calls_transition_rpc(mock_db):
    link_dataset_to_collection(UUID(DATASET_ID), UUID(COLLECTION_ID))
    mock_db["call_transition"].assert_called_once_with(
        "transition_to_collection_linked", SOURCE_ID, DATASET_ID
    )


def test_link_idempotent_no_duplicate(mock_db):
    link_dataset_to_collection(UUID(DATASET_ID), UUID(COLLECTION_ID))
    # Second call: the dataset has already advanced to COLLECTION_LINKED.
    mock_db["fetch_dataset"].return_value = _dataset_row(lifecycle_state="COLLECTION_LINKED")
    second = link_dataset_to_collection(UUID(DATASET_ID), UUID(COLLECTION_ID))
    assert str(second.dataset_id) == DATASET_ID
    # The link insert is ON CONFLICT DO NOTHING; the transition runs only once.
    assert mock_db["insert_link"].call_count == 2
    assert mock_db["call_transition"].call_count == 1


def test_link_dataset_not_found_raises(mock_db):
    mock_db["fetch_dataset"].side_effect = ValueError(f"Dataset {DATASET_ID} not found in pdqe.datasets")
    with pytest.raises(ValueError, match="not found"):
        link_dataset_to_collection(UUID(DATASET_ID), UUID(COLLECTION_ID))
    mock_db["insert_link"].assert_not_called()


def test_link_collection_not_found_raises(mock_db):
    mock_db["fetch_collection"].side_effect = ValueError(
        f"Collection {COLLECTION_ID} not found in pdqe.collections"
    )
    with pytest.raises(ValueError, match="not found"):
        link_dataset_to_collection(UUID(DATASET_ID), UUID(COLLECTION_ID))
    mock_db["insert_link"].assert_not_called()
    mock_db["call_transition"].assert_not_called()


# ── Group 5 — P9 + provenance ─────────────────────────────────────────────────


def test_p9_extra_fields_rejected_on_collection_create():
    with pytest.raises(ValidationError):
        CollectionCreate.model_validate(
            {"name": "Pacific Fisheries", "domain": "FISHERIES", "collection_id": str(uuid4())}
        )


def test_p9_extra_fields_rejected_on_dataset_create():
    with pytest.raises(ValidationError):
        # Provenance may never be caller-supplied.
        DatasetCreate.model_validate(
            {"source_id": SOURCE_ID, "title": "Tuna", "extraction_ids": [str(uuid4())]}
        )


def test_dataset_hash_in_record(mock_db):
    record = create_dataset(UUID(SOURCE_ID))
    assert record.dataset_hash
    assert re.fullmatch(r"[0-9a-f]{64}", record.dataset_hash)
    # The hash sent to the DB is the one the builder computed.
    assert mock_db["insert_dataset"].call_args.args[0]["dataset_hash"] == record.dataset_hash


def test_source_ids_array_includes_primary(mock_db):
    # Multi-document synthesis: a second source contributed an ingestion.
    mock_db["fetch_extraction"].return_value = {
        **EXTRACTION,
        "contributing_ingestion_ids": [INGESTION_ID, SECOND_INGESTION_ID],
    }
    mock_db["fetch_ingestion_source_ids"].return_value = [SECOND_SOURCE_ID, SOURCE_ID]
    draft = build_dataset(UUID(SOURCE_ID))
    assert [str(s) for s in draft.source_ids] == [SOURCE_ID, SECOND_SOURCE_ID]
    assert draft.primary_source_id in draft.source_ids

    # The schema refuses a primary source missing from source_ids.
    with pytest.raises(ValidationError, match="primary_source_id"):
        DatasetRecord.model_validate(_dataset_row(source_ids=[SECOND_SOURCE_ID]))


def test_extraction_ids_preserved(mock_db):
    record = create_dataset(UUID(SOURCE_ID))
    assert [str(e) for e in record.extraction_ids] == [EXTRACTION_ID]
    # A caller override changes descriptive fields only — never provenance.
    overrides = DatasetCreate(source_id=UUID(SOURCE_ID), title="Samoa tuna catch 2024")
    draft = build_dataset(UUID(SOURCE_ID), overrides)
    assert draft.title == "Samoa tuna catch 2024"
    assert [str(e) for e in draft.extraction_ids] == [EXTRACTION_ID]
    # An empty extraction list can never be a valid record.
    with pytest.raises(ValidationError):
        DatasetRecord.model_validate(_dataset_row(extraction_ids=[]))


def test_excluded_licence_blocked_at_db_constraint():
    sql = MIGRATION.read_text()
    # The table-level CHECK is the last line of defence, independent of Python.
    assert re.search(r"CHECK\s*\(\s*licence_status\s*!=\s*'EXCLUDED'\s*\)", sql)
    assert re.search(r"CHECK\s*\(\s*licence_status\s*!=\s*'UNKNOWN'\s*\)", sql)
    # The Python record schema mirrors it.
    with pytest.raises(ValidationError, match="EXCLUDED"):
        DatasetRecord.model_validate(_dataset_row(licence_status="EXCLUDED"))
