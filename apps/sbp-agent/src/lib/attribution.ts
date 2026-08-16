import { createHash, randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import type { AttributionRequest } from "@pdc/shared-types";

export interface AttributionSubmission {
  success: boolean;
  error?: string;
}

const ATTRIBUTION_SIGNATURE_VERSION = "v1";

/**
 * Deliberate duplicate of apps/agents/src/lib/attribution.ts — this app has
 * never shared code with apps/agents (separate package, separate deploy),
 * and the signing scheme (raw Ed25519, must match
 * apps/directory-api/src/lib/algorandAttestation.ts's
 * buildAttributionSignedMessage exactly) is the entire content of this
 * file. See that file's doc comment for the full reasoning.
 */
function buildSignedMessage(params: { runId: string; agentId: string; nonce: string; timestamp: string }): string {
  return `pdc-attribution:${ATTRIBUTION_SIGNATURE_VERSION}:${params.runId}:${params.agentId}:${params.nonce}:${params.timestamp}`;
}

/** SHA-256 of a wallet address — the directory API never receives the raw
 * wallet, only this hash (Decision 37 privacy rule). sbp-agent has no
 * separate "originating user": it queries on SBP's own behalf, not on
 * behalf of a Pacific user paying it for a run, so the honest value here is
 * its own operational wallet — see self-register.ts's caller. */
export function hashUserWallet(address: string): string {
  return createHash("sha256").update(address).digest("hex");
}

/**
 * Submits a wallet-signed attribution record to POST /agent/attribution
 * (Decision 37). Called once per non-dry-run query cycle from index.ts,
 * after runQueryCycle() returns — attribution covers whatever real
 * on-chain payments that cycle made, regardless of whether the cycle as a
 * whole "succeeded" (a directory query that settled but an endpoint query
 * that then failed still made one real payment that must be attributed).
 */
export async function submitAttribution(params: {
  directoryApiUrl: string;
  agentWalletKeyBase64: string;
  agentOperationalWalletAddress: string;
  agentId: string;
  runId: string;
  endpointTxIds: string[];
  originatingUserWallet: string;
}): Promise<AttributionSubmission> {
  if (params.endpointTxIds.length === 0) {
    return { success: false, error: "no endpoint transactions to attribute" };
  }

  const secretKey = new Uint8Array(Buffer.from(params.agentWalletKeyBase64, "base64"));
  const nonce = randomBytes(16).toString("hex");
  const timestamp = new Date().toISOString();
  const message = buildSignedMessage({ runId: params.runId, agentId: params.agentId, nonce, timestamp });
  const signature = nacl.sign.detached(new TextEncoder().encode(message), secretKey);

  const body: AttributionRequest = {
    run_id: params.runId,
    agent_id: params.agentId,
    endpoint_tx_ids: params.endpointTxIds,
    originating_user_wallet_hash: hashUserWallet(params.originatingUserWallet),
    signed_by: params.agentOperationalWalletAddress,
    signature: Buffer.from(signature).toString("base64"),
    nonce,
    timestamp,
  };

  try {
    const res = await fetch(`${params.directoryApiUrl.replace(/\/$/, "")}/agent/attribution`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errorBody: unknown = await res.json().catch(() => undefined);
      return { success: false, error: `HTTP ${res.status}: ${JSON.stringify(errorBody)}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
