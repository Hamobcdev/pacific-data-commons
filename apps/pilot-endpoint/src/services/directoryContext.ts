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
 * Resolves a directory listing's provider/endpoint identity from the
 * `endpoints` table by matching (endpoint_url, data_category[, data_sub_category]).
 * Session 14 lists the fisheries dataset under two categories (fisheries +
 * ocean) for discovery purposes — one physical dataset/endpoint, so
 * `subCategory` stays omitted there and every settled payment on any of its
 * 5 tier routes attributes to the same endpoint_id regardless of how the
 * buyer found it (matches on category alone, same as before Session 21).
 *
 * Session 21 added three more datasets (2 research papers + 1 adoption
 * landscape) that all share the same PUBLIC_URL *and* the same category
 * ('governance') but are genuinely different listings — data_sub_category
 * is what disambiguates them, so those three call sites always pass it.
 *
 * Called fresh per settled payment (see index.ts's onSettled), not cached
 * once at boot — each route resolves its own endpoint_id at settlement
 * time so a payment on one dataset's route can never attribute revenue to
 * a different dataset's endpoint row.
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
  subCategory?: string,
): Promise<DirectoryContext | null> {
  let query = supabase.from("endpoints").select("id, provider_id").eq("endpoint_url", publicUrl).eq("data_category", category);
  if (subCategory) {
    query = query.eq("data_sub_category", subCategory);
  }
  const { data: endpoint, error: endpointError } = await query.maybeSingle();

  if (endpointError || !endpoint) {
    logger.warn("directory_context_lookup_failed", {
      publicUrl,
      category,
      subCategory,
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
