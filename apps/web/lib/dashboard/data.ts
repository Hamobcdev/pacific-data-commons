import { createServiceClient } from "@/lib/supabase/server";
import type { Endpoint, Provider, TransactionLogEntry } from "@pdc/shared-types";

export interface DashboardData {
  provider: Provider;
  endpoints: Endpoint[];
  recentTransactions: TransactionLogEntry[];
  /** Highest verified-positive upvote count across this provider's
   * endpoints — feeds the Silver tier progress widget. */
  bestUpvoteCount: number;
  /** Session 18 — endpoint.id -> its latest_version_id's certified_at, for
   * EndpointList's "recently updated" badge. A separate map rather than
   * joined onto Endpoint itself since Endpoint mirrors the endpoints table
   * exactly (see shared-types/endpoints.ts's own doc comment) and
   * certified_at lives on endpoint_versions. */
  latestCertifiedAtByEndpointId: Record<string, string | null>;
}

/**
 * Server-only dashboard read (Deliverable 8) — service-role client, same
 * posture as generate-endpoint-package.ts and other privileged reads in
 * this app: this page is only reachable after getResumedProvider()
 * confirms the visitor's Supabase Auth session's email matches this exact
 * provider, so a service-role read here isn't exposing anything the
 * visitor isn't already authorized to see.
 */
export async function getDashboardData(providerId: string): Promise<DashboardData | null> {
  const supabase = createServiceClient();

  const { data: provider, error: providerError } = await supabase.from("providers").select("*").eq("id", providerId).maybeSingle();
  if (providerError || !provider) return null;

  const { data: endpoints } = await supabase
    .from("endpoints")
    .select("*")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false });

  const { data: recentTransactions } = await supabase
    .from("transactions_log")
    .select("*")
    .eq("provider_id", providerId)
    .order("queried_at", { ascending: false })
    .limit(10);

  let bestUpvoteCount = 0;
  for (const endpoint of endpoints ?? []) {
    const { count } = await supabase
      .from("community_ratings")
      .select("id", { count: "exact", head: true })
      .eq("endpoint_id", endpoint.id as string)
      .eq("rating", "positive")
      .eq("query_verified", true);
    bestUpvoteCount = Math.max(bestUpvoteCount, count ?? 0);
  }

  const latestVersionIds = (endpoints ?? [])
    .map((e) => (e as Endpoint).latest_version_id)
    .filter((id): id is string => id !== null);

  const latestCertifiedAtByEndpointId: Record<string, string | null> = {};
  if (latestVersionIds.length > 0) {
    const { data: latestVersions } = await supabase.from("endpoint_versions").select("id, certified_at").in("id", latestVersionIds);
    const certifiedAtByVersionId = new Map(((latestVersions ?? []) as { id: string; certified_at: string | null }[]).map((v) => [v.id, v.certified_at]));
    for (const endpoint of (endpoints ?? []) as Endpoint[]) {
      latestCertifiedAtByEndpointId[endpoint.id] = endpoint.latest_version_id ? (certifiedAtByVersionId.get(endpoint.latest_version_id) ?? null) : null;
    }
  }

  return {
    provider: provider as Provider,
    endpoints: (endpoints ?? []) as Endpoint[],
    recentTransactions: (recentTransactions ?? []) as TransactionLogEntry[],
    bestUpvoteCount,
    latestCertifiedAtByEndpointId,
  };
}
