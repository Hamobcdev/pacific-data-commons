import { createServiceClient } from "@/lib/supabase/server";
import type { Endpoint, Provider, TransactionLogEntry } from "@pdc/shared-types";

export interface DashboardData {
  provider: Provider;
  endpoints: Endpoint[];
  recentTransactions: TransactionLogEntry[];
  /** Highest verified-positive upvote count across this provider's
   * endpoints — feeds the Silver tier progress widget. */
  bestUpvoteCount: number;
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

  return {
    provider: provider as Provider,
    endpoints: (endpoints ?? []) as Endpoint[],
    recentTransactions: (recentTransactions ?? []) as TransactionLogEntry[],
    bestUpvoteCount,
  };
}
