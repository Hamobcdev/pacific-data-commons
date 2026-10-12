"""
PDQE Stage 11 — auto-canary on publication.

Covers app.integration.auto_canary (the best-effort canary payment fired after
SBP publication) and its wiring into approver.publish_endpoint. No network
call and no subprocess is made: httpx.head and the TypeScript helper are
patched in every test that gets that far.
"""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.endpoint.schemas import EndpointRecord
from app.integration import auto_canary
from app.integration.approver import publish_endpoint
from app.integration.x402_canary_helper import max_atomic_for
from tests.test_stage09_pdc_integration import (  # noqa: F401 — fake_db_factory is a fixture
    ENDPOINT_ID,
    SOURCE_ID,
    WALLET,
    _approved_state,
    _published_state,
    _row,
    fake_db_factory,
)

CANARY = "Q5XTALN45D32I572OZAVZ4FW6UYSW6A4FFAX4YOY6PP3YCD4JJJ3JQRYKI"
BASE_URL = "https://api.example.invalid"


class _Row:
    """Minimal holder so _published_state() can mutate a plain row dict."""

    def __init__(self) -> None:
        self.row = _row()
        self.source_state = "ENDPOINT_GENERATED"


def _published_record(**overrides) -> EndpointRecord:
    holder = _published_state(_Row())
    holder.row.update(overrides)
    return EndpointRecord.model_validate(holder.row)


@pytest.fixture
def live_env(monkeypatch):
    """Every auto-canary gate open; individual tests close one."""
    monkeypatch.setenv("CANARY_WALLET_MNEMONIC", "test mnemonic never used")
    monkeypatch.setenv("AGENT_WALLET_ADDRESS", CANARY)
    monkeypatch.setenv("VITE_FLAG_LIVE_RPC_ACTIVE", "true")
    monkeypatch.setenv("PDQE_ENDPOINT_BASE_URL", BASE_URL)
    monkeypatch.delenv("ALGORAND_NETWORK", raising=False)


@pytest.fixture
def no_network():
    with patch.object(auto_canary.httpx, "head") as head, patch.object(auto_canary, "run_helper") as helper:
        yield head, helper


def test_auto_canary_skips_self_payment(live_env, monkeypatch, no_network):
    head, helper = no_network
    monkeypatch.setenv("AGENT_WALLET_ADDRESS", WALLET)  # payer == endpoint payTo
    outcome = auto_canary.fire_auto_canary(_published_record())
    assert outcome == auto_canary.SKIPPED_SELF_PAYMENT
    head.assert_not_called()
    helper.assert_not_called()


def test_auto_canary_skips_on_404(live_env, no_network):
    head, helper = no_network
    head.return_value = MagicMock(status_code=404)
    record = _published_record()
    outcome = auto_canary.fire_auto_canary(record)
    assert outcome == auto_canary.SKIPPED_NOT_FOUND
    head.assert_called_once()
    assert head.call_args.args[0] == f"{BASE_URL}{record.path}"
    helper.assert_not_called()


def test_auto_canary_disabled_when_no_mnemonic(live_env, monkeypatch, no_network):
    head, helper = no_network
    monkeypatch.setenv("CANARY_WALLET_MNEMONIC", "")
    record = _published_record()
    assert auto_canary.fire_auto_canary(record) == auto_canary.SKIPPED_DISABLED
    with patch.object(auto_canary.threading, "Thread") as thread:
        auto_canary.schedule_auto_canary(record)
    thread.assert_not_called()
    head.assert_not_called()
    helper.assert_not_called()


def test_auto_canary_does_not_block_approval_on_exception(fake_db_factory, live_env):
    # Failure inside the payment path: fire_auto_canary swallows it.
    with patch.object(auto_canary.httpx, "head", side_effect=RuntimeError("boom")):
        assert auto_canary.fire_auto_canary(_published_record()) == auto_canary.ERROR

    # Failure while scheduling: publication still succeeds and returns the record.
    fake = fake_db_factory(_row())
    _approved_state(fake)
    with patch("app.integration.approver.schedule_auto_canary", side_effect=RuntimeError("boom")):
        record = publish_endpoint(ENDPOINT_ID, SOURCE_ID)
    assert record.status.value == "PUBLISHED"
    assert fake.calls == ["published"]


def test_auto_canary_skips_when_live_flag_off(live_env, monkeypatch, no_network):
    head, helper = no_network
    monkeypatch.setenv("VITE_FLAG_LIVE_RPC_ACTIVE", "false")
    assert auto_canary.fire_auto_canary(_published_record()) == auto_canary.SKIPPED_LIVE_RPC_INACTIVE
    head.assert_not_called()
    helper.assert_not_called()


def test_auto_canary_skips_without_base_url(live_env, monkeypatch, no_network):
    head, helper = no_network
    monkeypatch.delenv("PDQE_ENDPOINT_BASE_URL")
    assert auto_canary.fire_auto_canary(_published_record()) == auto_canary.SKIPPED_NO_URL
    head.assert_not_called()
    helper.assert_not_called()


def test_auto_canary_pays_with_ten_percent_tolerance(live_env, no_network):
    head, helper = no_network
    head.return_value = MagicMock(status_code=402)
    helper.return_value = {"outcome": "settled", "algo_tx_id": "TX"}
    record = _published_record(price_usdc="0.0500")
    assert auto_canary.fire_auto_canary(record) == auto_canary.SETTLED
    job = helper.call_args.args[0]
    assert job["maxAtomic"] == "55000"
    assert job["expectedPayer"] == CANARY
    assert job["inspectOnly"] is False
    assert job["network"] == "mainnet"


def test_schedule_runs_payment_off_the_request_thread(live_env):
    record = _published_record()
    with patch.object(auto_canary.threading, "Thread") as thread:
        auto_canary.schedule_auto_canary(record)
    thread.assert_called_once()
    assert thread.call_args.kwargs["target"] is auto_canary.fire_auto_canary
    assert thread.call_args.kwargs["daemon"] is True
    thread.return_value.start.assert_called_once()


def test_max_atomic_rounds_down():
    assert max_atomic_for(Decimal("0.01")) == 11000
    assert max_atomic_for(Decimal("0.001")) == 1100
    assert max_atomic_for(Decimal("0.0001")) == 110
