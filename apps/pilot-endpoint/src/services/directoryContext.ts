import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger.js";

export interface DirectoryContext {
  providerId: string;
  endpointId: string;
  /** Cached once at startup alongside the id lookup — these almost never
   * change mid-deployment, and re-reading them per settled payment would be
   * one avoidable query per paid request. A restart picks up any change. */
  providerPct: number;
  sbpFeePct: number;
}

/**
 * Resolves this deployment's own provider/endpoint identity from the
 * `endpoints` table by matching (endpoint_url, data_category) — the two
 * fields that together uniquely identify which directory listing this
 * running process actually *is*. Session 14 lists this same PUBLIC_URL
 * under two categories (fisheries + ocean) for discovery purposes, but it's
 * one physical dataset/endpoint; `category` here is always the endpoint's
 * *primary* category (DATASET_METADATA.category), not whichever category a
 * buyer happened to search under, so every settled payment attributes to
 * the same endpoint_id regardless of how the buyer found it.
 *
 * Returns null (never throws) on any failure — a directory-lookup miss must
 * never stop this process from serving paid data it has already accepted
 * payment for; it just means transaction logging degrades to "log and skip"
 * until the listing/URL mismatch is fixed. See transactionLogger.ts.
 */
export async function resolveDirectoryContext(
  supabase: SupabaseClient,
  publicUrl: string,
  category: string,
): Promise<DirectoryContext | null> {
  const { data: endpoint, error: endpointError } = await supabase
    .from("endpoints")
    .select("id, provider_id")
    .eq("endpoint_url", publicUrl)
    .eq("data_category", category)
    .maybeSingle();

  if (endpointError || !endpoint) {
    logger.warn("directory_context_lookup_failed", {
      publicUrl,
      category,
      error: endpointError?.message ?? "no matching endpoint row",
      action: "settled payments will not be logged to transactions_log until this is fixed",
    });
    return null;
  }

  const providerId = endpoint.provider_id as string;
  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .select("provider_pct, sbp_fee_pct")
    .eq("id", providerId)
    .maybeSingle();

  if (providerError || !provider) {
    logger.warn("directory_context_provider_lookup_failed", {
      providerId,
      error: providerError?.message ?? "provider row not found",
      action: "settled payments will not be logged to transactions_log until this is fixed",
    });
    return null;
  }

  return {
    providerId,
    endpointId: endpoint.id as string,
    providerPct: Number(provider.provider_pct),
    sbpFeePct: Number(provider.sbp_fee_pct),
  };
}
