import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger.js";

/**
 * Session 21 — records every search, including zero-result ones, as
 * evidence of unmet demand for the competition submission
 * (directory_demand_signals, session21_competition_prep.sql). Called from
 * search.ts without being awaited before the response returns — same
 * "never blocks the response the buyer already paid for" posture as
 * transactionLogger.ts/directoryPaymentLogger.ts, just for a signal that
 * matters even on a zero-result search where nothing else gets logged.
 */
export async function recordDemandSignal(
  supabase: SupabaseClient,
  params: { searchQuery: string | null; category: string | null; resultsCount: number },
): Promise<void> {
  const { error } = await supabase.from("directory_demand_signals").insert({
    search_query: params.searchQuery,
    category: params.category,
    results_count: params.resultsCount,
  });

  if (error) {
    logger.error("demand_signal_write_failed", { error: error.message });
  }
}
