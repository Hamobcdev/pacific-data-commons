/**
 * integrity.ts (Session 17, Deliverables 2-3 — Decisions 49-50)
 * Automatic data integrity verification before agent endpoint payments.
 * Tamper detection, not prevention — prevention (content-addressed
 * immutable storage) is Phase 2 (Decision 52-53).
 *
 * Called by BaseAgent.run() before every queryEndpoint() call. Only a
 * status of 'fail' (a confirmed hash mismatch) blocks payment;
 * 'no_cert_hash' (nothing certified yet) and 'endpoint_unavailable'
 * (couldn't reach /integrity or directory-api) are non-blocking — an
 * inconclusive check must never itself become a denial-of-service against
 * a provider's honest endpoint.
 */
import type { CertifiedHashResponse, IntegrityCheckStatus, IntegrityCheckTrigger, IntegrityEventRequest, IntegrityEventResponse } from "@pdc/shared-types";
import { logger } from "./lib/logger.js";

const INTEGRITY_FETCH_TIMEOUT_MS = 2000;

export type IntegrityStatus = IntegrityCheckStatus;

export interface IntegrityCheckResult {
  passed: boolean;
  status: IntegrityStatus;
  expectedHash: string | null;
  actualHash: string | null;
  message: string;
}

/**
 * Fetches the certified hash from directory-api for an endpoint. Returns
 * null if no active certificate exists, or if the lookup itself fails
 * (treated the same way by checkEndpointIntegrity — both mean "nothing to
 * compare against yet", not "tampered").
 */
export async function getCertifiedHash(
  endpointId: string,
  directoryApiUrl: string,
  internalApiKey: string,
): Promise<string | null> {
  try {
    const url = `${directoryApiUrl.replace(/\/$/, "")}/internal/certified-hash/${endpointId}`;
    const res = await fetch(url, {
      headers: { "x-internal-api-key": internalApiKey },
      signal: AbortSignal.timeout(INTEGRITY_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn("certified_hash_lookup_failed", { endpointId, httpStatus: res.status });
      return null;
    }
    const body = (await res.json()) as CertifiedHashResponse;
    return body.dataset_content_hash;
  } catch (err) {
    logger.warn("certified_hash_lookup_error", { endpointId, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Calls /integrity on the provider endpoint directly (no payment — this is
 * always a free route, see apps/pilot-endpoint/src/routes/free/integrity.ts).
 * 2-second timeout; returns null if unreachable, times out, or the endpoint
 * has no integrity_url configured yet.
 */
export async function getActualHash(integrityUrl: string | null): Promise<string | null> {
  if (!integrityUrl) return null;
  try {
    const res = await fetch(integrityUrl, { signal: AbortSignal.timeout(INTEGRITY_FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      logger.warn("integrity_endpoint_unreachable", { integrityUrl, httpStatus: res.status });
      return null;
    }
    const body = (await res.json()) as { hash: string };
    return body.hash;
  } catch (err) {
    logger.warn("integrity_endpoint_error", { integrityUrl, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Main integrity check (Deliverable 2; Session 18 Deliverable 8 adds the
 * pendingRecertification short-circuit). Never throws — every failure mode
 * resolves to a status, not an exception; only the caller (BaseAgent)
 * decides whether 'fail' should become a thrown IntegrityCheckFailedError.
 */
export async function checkEndpointIntegrity(
  endpointId: string,
  integrityUrl: string | null,
  directoryApiUrl: string,
  internalApiKey: string,
  pendingRecertification: boolean,
): Promise<IntegrityCheckResult> {
  if (pendingRecertification) {
    // Session 18 (Decision 52) — provider has declared an update and the
    // dataset is mid-change. Skip both network calls entirely: comparing
    // against the pre-update certified hash right now would only ever
    // produce a false 'fail'. Never blocks payment.
    return {
      passed: true,
      status: "pending_recertification",
      expectedHash: null,
      actualHash: null,
      message: "Endpoint update in progress — integrity check paused. Queries continue normally.",
    };
  }

  const expectedHash = await getCertifiedHash(endpointId, directoryApiUrl, internalApiKey);
  if (!expectedHash) {
    return {
      passed: true,
      status: "no_cert_hash",
      expectedHash: null,
      actualHash: null,
      message: `No active certificate for endpoint ${endpointId} — nothing to verify against.`,
    };
  }

  const actualHash = await getActualHash(integrityUrl);
  if (!actualHash) {
    return {
      passed: true,
      status: "endpoint_unavailable",
      expectedHash,
      actualHash: null,
      message: `Could not reach /integrity for endpoint ${endpointId} — proceeding without verification.`,
    };
  }

  if (actualHash !== expectedHash) {
    return {
      passed: false,
      status: "fail",
      expectedHash,
      actualHash,
      message: `Hash mismatch for endpoint ${endpointId}: certified ${expectedHash.slice(0, 16)}... vs current ${actualHash.slice(0, 16)}...`,
    };
  }

  return {
    passed: true,
    status: "pass",
    expectedHash,
    actualHash,
    message: `Integrity verified for endpoint ${endpointId}.`,
  };
}

export interface RecordIntegrityEventParams {
  endpointId: string;
  checkTrigger: IntegrityCheckTrigger;
  status: IntegrityStatus;
  expectedHash: string | null;
  actualHash: string | null;
  agentId: string | null;
  transactionBlocked: boolean;
}

/**
 * Records the check with directory-api (Deliverable 4). Callers must treat
 * this as fire-and-forget (see BaseAgent.run()'s `.catch()` — never awaited
 * in a way that can delay or fail an agent run over a logging write). Never
 * throws itself either way; a network/HTTP failure here is only logged.
 */
export async function recordIntegrityEvent(
  directoryApiUrl: string,
  internalApiKey: string,
  params: RecordIntegrityEventParams,
): Promise<IntegrityEventResponse | null> {
  const body: IntegrityEventRequest = {
    endpoint_id: params.endpointId,
    check_trigger: params.checkTrigger,
    status: params.status,
    expected_hash: params.expectedHash,
    actual_hash: params.actualHash,
    agent_id: params.agentId,
    transaction_blocked: params.transactionBlocked,
  };

  const url = `${directoryApiUrl.replace(/\/$/, "")}/internal/integrity-event`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-api-key": internalApiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(INTEGRITY_FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`POST /internal/integrity-event returned HTTP ${res.status}`);
  }
  return (await res.json()) as IntegrityEventResponse;
}
