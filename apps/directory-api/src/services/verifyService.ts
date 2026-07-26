import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, NotFoundError } from "../lib/errors.js";
import type { ProvenanceCertificate as ProvenanceCertificateRow } from "@pdc/shared-types";

export interface CertificateVerification {
  certHash: string;
  status: ProvenanceCertificateRow["status"];
  trustTier: ProvenanceCertificateRow["trust_tier"];
  providerId: string;
  endpointId: string;
  algoAssetId: string | null;
  datasetContentHash: string | null;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  issuedBy: string;
  certificate: Record<string, unknown>;
}

/**
 * Deliberately returns revoked/expired/suspended certs too, with their status
 * — this route exists so a buyer can check trust, and "certificate not found"
 * for a revoked cert would hide exactly the fact they're checking for
 * (Certificate Revocation Policy, CLAUDE.md Section 11: buyers must be able
 * to learn a cert was revoked).
 */
export async function verifyCertificateByHash(
  supabase: SupabaseClient,
  certHash: string,
): Promise<CertificateVerification> {
  const { data, error } = await supabase
    .from("provenance_certificates")
    .select("*")
    .eq("cert_hash", certHash)
    .maybeSingle();

  if (error) {
    throw new AppError(502, "database_error", `Certificate lookup failed: ${error.message}`);
  }
  if (!data) {
    throw new NotFoundError(`No certificate with hash "${certHash}"`);
  }

  const row = data as ProvenanceCertificateRow;
  return {
    certHash: row.cert_hash,
    status: row.status,
    trustTier: row.trust_tier,
    providerId: row.provider_id,
    endpointId: row.endpoint_id,
    algoAssetId: row.algo_asset_id,
    datasetContentHash: row.dataset_content_hash,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revocationReason: row.revocation_reason,
    issuedBy: row.issued_by,
    certificate: row.cert_json,
  };
}
