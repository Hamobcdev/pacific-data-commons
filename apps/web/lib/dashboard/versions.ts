import { createServiceClient } from "@/lib/supabase/server";
import type { Endpoint, EndpointVersion } from "@pdc/shared-types";

/**
 * Server-only reads for the declared-update flow (Session 18), same
 * service-role posture as lib/dashboard/data.ts: every caller here already
 * confirmed the visitor's session belongs to this exact provider via
 * getResumedProvider() before reaching these functions.
 */

/** Fetches an endpoint only if it belongs to the given provider — every
 * caller in the declare-update flow needs this exact check before showing
 * or mutating anything, so it lives here once rather than being
 * hand-repeated per action/page. */
export async function getOwnedEndpoint(providerId: string, endpointId: string): Promise<Endpoint | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("endpoints").select("*").eq("id", endpointId).maybeSingle();
  if (error || !data) return null;
  const endpoint = data as Endpoint;
  if (endpoint.provider_id !== providerId) return null;
  return endpoint;
}

export async function getEndpointVersions(endpointId: string): Promise<EndpointVersion[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("endpoint_versions")
    .select("*")
    .eq("endpoint_id", endpointId)
    .order("version_number", { ascending: false });
  return (data ?? []) as EndpointVersion[];
}

/** The one endpoint_versions row with certified_at IS NULL for this
 * endpoint, if any — the in-progress declared update. UNIQUE(endpoint_id,
 * version_number) plus declare-update always rejecting a second declaration
 * while pending_recertification is true means there is never more than one. */
export async function getPendingVersion(endpointId: string): Promise<EndpointVersion | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("endpoint_versions")
    .select("*")
    .eq("endpoint_id", endpointId)
    .is("certified_at", null)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as EndpointVersion | null) ?? null;
}

const NOTIFICATION_WINDOW_DAYS = 90;

/**
 * Preview count for the declare-update wizard's Step 3 summary ("[N] agents
 * and buyers ... will be notified"). Read-only mirror of
 * apps/directory-api/src/services/notificationService.ts's targeting query
 * (transactions_log -> agent_run_endpoints array-overlap join, plus opted-in
 * community_ratings.rater_email) — duplicated rather than shared because
 * this is preview-only data read before any update is declared, not a
 * security-relevant path, and apps/web has no workspace dependency on
 * @pdc/directory-api to import the real implementation from.
 */
export async function getEligibleNotificationCount(endpointId: string): Promise<number> {
  const supabase = createServiceClient();
  const windowStart = new Date(Date.now() - NOTIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: txRows } = await supabase
    .from("transactions_log")
    .select("algo_tx_id")
    .eq("endpoint_id", endpointId)
    .gte("queried_at", windowStart)
    .not("algo_tx_id", "is", null);
  const txIds = ((txRows ?? []) as { algo_tx_id: string }[]).map((r) => r.algo_tx_id);

  let agentCount = 0;
  if (txIds.length > 0) {
    const { data: runRows } = await supabase.from("agent_run_endpoints").select("signed_by").overlaps("endpoint_tx_ids", txIds).gte("submitted_at", windowStart);
    agentCount = new Set(((runRows ?? []) as { signed_by: string }[]).map((r) => r.signed_by)).size;
  }

  const { data: ratingRows } = await supabase.from("community_ratings").select("rater_email").eq("endpoint_id", endpointId).not("rater_email", "is", null);
  const buyerCount = new Set(((ratingRows ?? []) as { rater_email: string }[]).map((r) => r.rater_email)).size;

  return agentCount + buyerCount;
}
