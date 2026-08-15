/**
 * Session 18 (session18_version_registry.sql) — Decisions 52-53.
 * Declared dataset update flow: version registry + agent/buyer notification
 * queue. Mirrors endpoint_versions / endpoint_update_notifications exactly.
 */

export type UpdateCategory = "initial_certification" | "additive" | "correction" | "expansion" | "methodology_change";

export type CertifiedBy = "sbp_auto" | "sbp_human";

/** Mirrors `endpoint_versions`. */
export interface EndpointVersion {
  id: string;
  endpoint_id: string;
  version_number: number;
  /** NULL until confirm-update verifies it against the provider's live
   * /integrity route — see the migration's column comment. */
  dataset_content_hash: string | null;
  update_category: UpdateCategory;
  provider_change_description: string;
  records_added: number;
  records_modified: number;
  records_removed: number;
  new_parameters: string[] | null;
  date_range_extended: boolean;
  certified_at: string | null;
  certified_by: CertifiedBy;
  recertification_required: boolean;
  algorand_tx_id: string | null;
  notification_sent_at: string | null;
  notification_count: number;
  declared_by: string;
  declared_at: string;
  created_at: string;
}

export type NotificationRecipientType = "agent_wallet" | "buyer_email";

export type NotificationStatus = "pending" | "sent" | "failed" | "skipped";

/** The structured, machine-readable payload agents/buyers receive on a
 * certified update — also the shape returned by GET /endpoints/:id/versions
 * for polling (Deliverable 7's "agent version feed"). */
export interface DatasetUpdatedNotificationPayload {
  event: "dataset_updated";
  endpoint_id: string;
  endpoint_name: string;
  previous_version: number;
  new_version: number;
  update_category: UpdateCategory;
  change_description: string;
  records_added: number;
  records_modified: number;
  new_parameters: string[];
  date_range_extended: boolean;
  certified_at: string;
  query_url: string;
  versions_url: string;
}

/** Mirrors `endpoint_update_notifications`. */
export interface EndpointUpdateNotification {
  id: string;
  endpoint_version_id: string;
  endpoint_id: string;
  recipient_type: NotificationRecipientType;
  agent_wallet: string | null;
  buyer_email: string | null;
  notification_payload: DatasetUpdatedNotificationPayload;
  status: NotificationStatus;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

/** GET /endpoints/:endpointId/versions response (public, directory-api). */
export interface EndpointVersionsResponse {
  endpoint_id: string;
  current_version: number;
  versions: Array<{
    version_number: number;
    update_category: UpdateCategory;
    provider_change_description: string;
    records_added: number;
    records_modified: number;
    records_removed: number;
    new_parameters: string[] | null;
    date_range_extended: boolean;
    certified_at: string | null;
    recertification_required: boolean;
    algorand_tx_id: string | null;
    declared_at: string;
  }>;
}
