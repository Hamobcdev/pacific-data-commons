import type { TrustTier } from "./providers.js";

/** Mirrors `provenance_certificates` (session1_migration.sql, DOMAIN 2). */
export type CertificateStatus = "pending" | "active" | "expired" | "revoked" | "suspended";

export interface ProvenanceCertificate {
  id: string;
  provider_id: string;
  endpoint_id: string;

  algo_asset_id: string | null;
  cert_hash: string;
  dataset_content_hash: string | null;
  cert_json: Record<string, unknown>;

  trust_tier: TrustTier;

  domain_verified: boolean;
  wallet_verified: boolean;
  registry_verified: boolean;
  methodology_verified: boolean;
  llm_consistency_passed: boolean;
  researcher_credentials_verified: boolean;
  peer_reviewed: boolean;
  peer_review_venue: string | null;
  doi_verified: boolean;
  doi: string | null;
  spot_check_passed: boolean;
  coi_declaration_submitted: boolean;
  coi_declaration_hash: string | null;
  coi_declaration_url: string | null;

  cabinet_approval_verified: boolean;
  export_clearance_confirmed: boolean;

  status: CertificateStatus;
  issued_at: string;
  expires_at: string | null;
  renewed_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  revocation_investigation_id: string | null;

  issued_by: string;
  created_at: string;
}

/** Mirrors `verification_queue` (session1_migration.sql, DOMAIN 2). */
export type VerificationQueueType = "new_provider" | "trust_upgrade" | "renewal" | "spot_check" | "revocation_investigation";

export type VerificationQueueStatus =
  | "queued"
  | "automated_running"
  | "awaiting_review"
  | "in_review"
  | "approved"
  | "rejected"
  | "more_info_needed";

export interface VerificationQueueEntry {
  id: string;
  provider_id: string;
  endpoint_id: string | null;
  queue_type: VerificationQueueType;
  target_tier: TrustTier | null;
  automated_checks: Record<string, unknown>;
  automated_at: string | null;
  assigned_to: string | null;
  reviewer_notes: string | null;
  status: VerificationQueueStatus;
  submitted_at: string;
  completed_at: string | null;
}
