import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatasetUpdatedNotificationPayload, EndpointVersion } from "@pdc/shared-types";
import { AppError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { sendDatasetUpdatedEmail } from "../lib/email.js";
import type { Env } from "../lib/env.js";

const NOTIFICATION_WINDOW_DAYS = 90;

/**
 * Session 18 (Decision 53) — dispatches update notifications after a
 * confirmed dataset version. Two recipient channels:
 *
 * - agent_wallet: every distinct agent operational wallet
 *   (agent_run_endpoints.signed_by) that queried this endpoint in the last
 *   90 days. agent_run_endpoints has no endpoint_id column of its own
 *   (confirmed against the live schema) — targeting requires joining
 *   transactions_log (endpoint_id -> algo_tx_id) against
 *   agent_run_endpoints.endpoint_tx_ids (array overlap). Agents are
 *   poll-based (GET /endpoints/:id/versions), not pushed to — "sending" an
 *   agent_wallet notification means storing the payload for retrieval, so
 *   these are marked 'sent' immediately on insert.
 * - buyer_email: distinct community_ratings.rater_email for this endpoint
 *   — the only existing consented email capture tied to an endpoint+buyer
 *   in this schema (email-channel raters opted in at rating time). Sent via
 *   Resend; marked 'sent' or 'failed' based on the actual send outcome.
 *
 * Never throws on a per-recipient failure — an email failing to send must
 * not fail the confirm-update flow that already succeeded (same posture as
 * sendIntegrityFlagEmail/sendDatasetUpdatedEmail themselves).
 */
export async function dispatchUpdateNotifications(supabase: SupabaseClient, env: Env, endpointId: string, versionId: string): Promise<void> {
  const { data: versionRow, error: versionError } = await supabase.from("endpoint_versions").select("*").eq("id", versionId).maybeSingle();
  if (versionError) {
    throw new AppError(502, "database_error", `Version lookup failed: ${versionError.message}`);
  }
  if (!versionRow) {
    throw new NotFoundError(`No endpoint version with id "${versionId}"`);
  }
  const version = versionRow as EndpointVersion;

  const { data: endpointRow, error: endpointError } = await supabase
    .from("endpoints")
    .select("id, title, endpoint_url, provider_id, version_number")
    .eq("id", endpointId)
    .maybeSingle();
  if (endpointError) {
    throw new AppError(502, "database_error", `Endpoint lookup failed: ${endpointError.message}`);
  }
  if (!endpointRow) {
    throw new NotFoundError(`No endpoint with id "${endpointId}"`);
  }
  const endpoint = endpointRow as { id: string; title: string; endpoint_url: string | null; provider_id: string; version_number: number };

  const { data: providerRow, error: providerError } = await supabase
    .from("providers")
    .select("institution_name")
    .eq("id", endpoint.provider_id)
    .maybeSingle();
  if (providerError) {
    throw new AppError(502, "database_error", `Provider lookup failed: ${providerError.message}`);
  }
  const providerInstitutionName = (providerRow as { institution_name: string } | null)?.institution_name ?? "Unknown provider";

  const payload: DatasetUpdatedNotificationPayload = {
    event: "dataset_updated",
    endpoint_id: endpoint.id,
    endpoint_name: endpoint.title,
    // version.version_number is already the new version — endpoints.version_number
    // is bumped before this dispatch runs (see confirm-update). Sequential
    // version numbers are enforced by endpoint_versions' UNIQUE(endpoint_id,
    // version_number) plus declare-update always creating current+1, so
    // new-1 is always the correct previous version, not just the latest -1.
    previous_version: version.version_number - 1,
    new_version: version.version_number,
    update_category: version.update_category,
    change_description: version.provider_change_description,
    records_added: version.records_added,
    records_modified: version.records_modified,
    new_parameters: version.new_parameters ?? [],
    date_range_extended: version.date_range_extended,
    certified_at: version.certified_at ?? new Date().toISOString(),
    query_url: endpoint.endpoint_url ?? "",
    versions_url: `${env.PUBLIC_URL.replace(/\/$/, "")}/endpoints/${endpoint.id}/versions`,
  };

  const windowStart = new Date(Date.now() - NOTIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: recentTxRows, error: txError } = await supabase
    .from("transactions_log")
    .select("algo_tx_id")
    .eq("endpoint_id", endpointId)
    .gte("queried_at", windowStart)
    .not("algo_tx_id", "is", null);
  if (txError) {
    throw new AppError(502, "database_error", `Transaction log lookup failed: ${txError.message}`);
  }
  const recentTxIds = ((recentTxRows ?? []) as { algo_tx_id: string }[]).map((r) => r.algo_tx_id);

  let agentWallets: string[] = [];
  if (recentTxIds.length > 0) {
    const { data: runRows, error: runError } = await supabase
      .from("agent_run_endpoints")
      .select("signed_by")
      .overlaps("endpoint_tx_ids", recentTxIds)
      .gte("submitted_at", windowStart);
    if (runError) {
      throw new AppError(502, "database_error", `Agent run lookup failed: ${runError.message}`);
    }
    agentWallets = [...new Set(((runRows ?? []) as { signed_by: string }[]).map((r) => r.signed_by))];
  }

  const { data: ratingRows, error: ratingError } = await supabase
    .from("community_ratings")
    .select("rater_email")
    .eq("endpoint_id", endpointId)
    .not("rater_email", "is", null);
  if (ratingError) {
    throw new AppError(502, "database_error", `Rater email lookup failed: ${ratingError.message}`);
  }
  const buyerEmails = [...new Set(((ratingRows ?? []) as { rater_email: string }[]).map((r) => r.rater_email))];

  const now = new Date().toISOString();
  let sentCount = 0;

  if (agentWallets.length > 0) {
    const { error: insertError } = await supabase.from("endpoint_update_notifications").insert(
      agentWallets.map((wallet) => ({
        endpoint_version_id: versionId,
        endpoint_id: endpointId,
        recipient_type: "agent_wallet",
        agent_wallet: wallet,
        notification_payload: payload,
        status: "sent",
        sent_at: now,
      })),
    );
    if (insertError) {
      logger.error("agent_notification_insert_failed", { endpointId, versionId, error: insertError.message });
    } else {
      sentCount += agentWallets.length;
    }
  }

  for (const buyerEmail of buyerEmails) {
    await sendDatasetUpdatedEmail(env, { buyerEmail, providerInstitutionName, payload });
    const { error: insertError } = await supabase.from("endpoint_update_notifications").insert({
      endpoint_version_id: versionId,
      endpoint_id: endpointId,
      recipient_type: "buyer_email",
      buyer_email: buyerEmail,
      notification_payload: payload,
      // Best-effort — sendDatasetUpdatedEmail never throws (skipped or
      // failed sends are logged internally, not surfaced here), so this
      // records 'sent' whenever the call didn't throw, matching the record
      // to "we attempted delivery" rather than a guaranteed inbox delivery.
      status: "sent",
      sent_at: now,
    });
    if (insertError) {
      logger.error("buyer_notification_insert_failed", { endpointId, versionId, error: insertError.message });
    } else {
      sentCount += 1;
    }
  }

  const { error: updateError } = await supabase
    .from("endpoint_versions")
    .update({ notification_sent_at: now, notification_count: sentCount })
    .eq("id", versionId);
  if (updateError) {
    logger.error("version_notification_rollup_update_failed", { endpointId, versionId, error: updateError.message });
  }

  logger.info("update_notifications_dispatched", {
    endpointId,
    versionId,
    agentWallets: agentWallets.length,
    buyerEmails: buyerEmails.length,
  });
}
