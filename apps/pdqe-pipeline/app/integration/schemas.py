"""
PDQE Stage 09 — PDC Integration Schemas.

P9 (CLAUDE.md): every input is untrusted data — request bodies, Supabase
rows and pdc-x402-adapter responses alike — and is validated here before
use. extra="forbid" on every model.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.endpoint.schemas import (
    ALGORAND_ADDRESS_PATTERN,
    MAX_PRICE_USDC,
    X402_REGISTRATION_ID_PATTERN,
)


class ValidationCheckResult(BaseModel):
    """Result of one automated validation check."""

    model_config = ConfigDict(extra="forbid")

    check_id: str
    passed: bool
    message: str


class EndpointValidationOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    endpoint_id: UUID
    passed: bool
    checks: list[ValidationCheckResult]
    validated_at: datetime


class ProviderApprovalInput(BaseModel):
    """Provider submits wallet + optional price override."""

    model_config = ConfigDict(extra="forbid")

    provider_wallet: str = Field(pattern=ALGORAND_ADDRESS_PATTERN)
    # None keeps the current price. A value must be >= the tier floor
    # (checked against the endpoint's tier in approver.py and by the DB).
    price_usdc: Optional[Decimal] = Field(default=None, gt=0, le=MAX_PRICE_USDC, decimal_places=4)


class SourceRefInput(BaseModel):
    """Body for the validate / publish / register routes."""

    model_config = ConfigDict(extra="forbid")

    source_id: UUID


class ProviderApprovalRequest(ProviderApprovalInput):
    """Body for POST /integration/approve/{endpoint_id}."""

    source_id: UUID


class IntegrationPipelineRequest(ProviderApprovalRequest):
    """Body for POST /integration/pipeline/{endpoint_id}."""


class X402RegistrationResult(BaseModel):
    """Result returned from pdc-x402-adapter after registration."""

    model_config = ConfigDict(extra="forbid")

    registration_id: str = Field(pattern=X402_REGISTRATION_ID_PATTERN)
    path: str = Field(max_length=200)
    price_usdc: Decimal = Field(gt=0, le=MAX_PRICE_USDC, decimal_places=4)
    provider_wallet: str = Field(pattern=ALGORAND_ADDRESS_PATTERN)
    registered_at: datetime
    cultural_sovereignty: bool
    # True when produced by the VITE_FLAG_LIVE_RPC_ACTIVE=false mock path.
    mock: bool = False


class IntegrationPipelineOutput(BaseModel):
    """Result of POST /integration/pipeline/{endpoint_id}."""

    model_config = ConfigDict(extra="forbid")

    validation: EndpointValidationOutput
    registration: Optional[X402RegistrationResult] = None
