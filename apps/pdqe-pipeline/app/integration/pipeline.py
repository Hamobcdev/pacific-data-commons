"""
PDQE Stage 09 — Integration pipeline.

validate → provider approval → publish → x402 register. Each step is also
exposed on its own for the API routes. PDQE hands off to PDC at
PUBLISHED → x402_QUERYABLE; nothing here duplicates PDC's registry, payment,
identity or certificate logic.
"""

from __future__ import annotations

import logging
from uuid import UUID

from app.endpoint.schemas import EndpointStatus
from app.integration import supabase_client as db
from app.integration.approver import (
    load_endpoint,
    publish_endpoint,
    require_source_state,
    submit_provider_approval,
)
from app.integration.schemas import (
    EndpointValidationOutput,
    IntegrationPipelineOutput,
    ProviderApprovalInput,
    X402RegistrationResult,
)
from app.integration.validator import validate_endpoint
from app.integration.x402_client import register_endpoint

logger = logging.getLogger(__name__)


def run_endpoint_validation(endpoint_id: UUID, source_id: UUID) -> EndpointValidationOutput:
    """
    1. Run validate_endpoint()
    2. If all checks pass: call pdqe.transition_to_endpoint_validated RPC
    3. If any check fails: do NOT transition — return output with passed=False
    4. Return EndpointValidationOutput
    """
    output = validate_endpoint(endpoint_id)
    if not output.passed:
        failed = [c.check_id for c in output.checks if not c.passed]
        logger.info("Endpoint %s failed validation: %s", endpoint_id, ", ".join(failed))
        return output

    endpoint = load_endpoint(endpoint_id)
    if endpoint.status != EndpointStatus.DRAFT:
        raise ValueError(f"Endpoint {endpoint_id} is {endpoint.status.value}, validation requires DRAFT")
    require_source_state(source_id, endpoint, "ENDPOINT_GENERATED")

    db.call_endpoint_validated(str(source_id), str(endpoint_id))
    logger.info("Endpoint %s validated", endpoint_id)
    return output


def run_x402_registration(endpoint_id: UUID, source_id: UUID) -> X402RegistrationResult:
    """
    1. Verify endpoint status == 'PUBLISHED'
    2. Call register_endpoint()
    3. Call pdqe.transition_to_x402_queryable RPC with registration_id
    4. Return X402RegistrationResult
    """
    endpoint = load_endpoint(endpoint_id)
    if endpoint.status != EndpointStatus.PUBLISHED:
        raise ValueError(f"Endpoint {endpoint_id} is {endpoint.status.value}, x402 registration requires PUBLISHED")
    if endpoint.x402_registration_id is not None:
        raise ValueError(f"Endpoint {endpoint_id} is already registered ({endpoint.x402_registration_id})")
    require_source_state(source_id, endpoint, "PUBLISHED")

    result = register_endpoint(endpoint)
    db.call_x402_queryable(str(source_id), str(endpoint_id), result.registration_id)
    logger.info("Endpoint %s x402-queryable (%s)", endpoint_id, result.registration_id)
    return result


def run_full_pipeline(
    endpoint_id: UUID,
    source_id: UUID,
    approval: ProviderApprovalInput,
) -> IntegrationPipelineOutput:
    """
    Validate → provider approval → publish → register, in one call. Stops
    after validation (registration=None) if any check fails.
    """
    validation = run_endpoint_validation(endpoint_id, source_id)
    if not validation.passed:
        return IntegrationPipelineOutput(validation=validation)
    submit_provider_approval(endpoint_id, source_id, approval)
    publish_endpoint(endpoint_id, source_id)
    registration = run_x402_registration(endpoint_id, source_id)
    return IntegrationPipelineOutput(validation=validation, registration=registration)
