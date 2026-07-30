import { createHash, randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import type { AttributionRequest } from "@pdc/shared-types";

export interface AttributionSubmission {
  success: boolean;
  error?: string;
}

const ATTRIBUTION_SIGNATURE_VERSION = "v1";

/** Must match apps/directory-api/src/lib/algorandAttestation.ts's
 * buildAttributionSignedMessage exactly — this is the message the server
 * reconstructs and verifies the signature against. */
function buildSignedMessage(params: { runId: string; agentId: string; nonce: string; timestamp: string }): string {
  return `pdc-attribution:${ATTRIBUTION_SIGNATURE_VERSION}:${params.runId}:${params.agentId}:${params.nonce}:${params.timestamp}`;
}

/** SHA-256 of the originating user's Algorand address — the directory API
 * never receives the raw wallet, only this hash (Decision 37 privacy rule). */
export function hashUserWallet(address: string): string {
  return createHash("sha256").update(address).digest("hex");
}

/**
 * Submits a wallet-signed attribution record to POST /agent/attribution
 * (Decision 37, R1). Callers MUST call this after every run that made real
 * endpoint payments, even if synthesis afterward failed — the payments
 * already happened and must be attributed regardless of run outcome.
 *
 * Signs with tweetnacl directly against the operational wallet's raw
 * 64-byte Ed25519 key (32-byte seed + 32-byte public key) — the exact
 * scheme apps/directory-api/src/lib/algorandAttestation.ts verifies
 * against (raw Ed25519 over UTF-8 bytes, no "TX" transaction prefix), and
 * the same key format @pdc/x402-adapter already expects for payments
 * (AGENT_WALLET_KEY). No Algorand SDK needed for signing, mirroring
 * directory-api's own no-algosdk approach for verification.
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
