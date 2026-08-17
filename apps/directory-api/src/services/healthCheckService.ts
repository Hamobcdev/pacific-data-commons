import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger.js";

const HEALTH_CHECK_TIMEOUT_MS = 2000;
const CONSECUTIVE_FAILS_TO_FLAG = 3;

export interface EndpointHealthResult {
  endpoint_id: string;
  title: string;
  health_check_url: string | null;
  health_status: "healthy" | "unhealthy";
  consecutive_health_fails: number;
}

export interface HealthCheckSummary {
  checked: number;
  healthy: number;
  unhealthy: number;
  skipped_no_url: number;
  results: EndpointHealthResult[];
}

async function pingEndpoint(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    return res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Endpoint health checker (CLAUDE.md §6 — "endpoint health checker,
 * Railway cron, every 5 min"). No such checker existed anywhere in the
 * repo before Session 24 — health_status has sat at its 'unknown' column
 * default since every endpoint row was created, not because of a Session
 * 20 regression.
 *
 * Triggered via POST /internal/health-check (internalAuth-gated, same
 * pattern as this file's siblings) rather than run as its own standalone
 * service — a Railway Cron Job hits this route every 5 minutes with the
 * shared X-Internal-Api-Key secret (configured in the Railway dashboard,
 * not expressible as a repo file; see this session's summary for the
 * exact command). middleware/internalAuth.ts's own doc comment already
 * anticipated exactly this integration point ("and eventually the
 * endpoint health checker cron").
 *
 * Pings every active endpoint's distinct health_check_url once (endpoints
 * sharing a URL — e.g. all 5 pilot-endpoint rows point at the same
 * /health — are deduplicated to one real HTTP request, then the result is
 * applied to every row sharing that URL) with a 2s timeout. 200 exactly
 * -> healthy; anything else (non-200, timeout, network error) -> unhealthy.
 * consecutive_health_fails resets to 0 on success, increments on failure —
 * mirrors the integrity checker's 3-consecutive-fails flagging pattern
 * (Decision 50) for consistency, though nothing currently reads a
 * health-based flag the way integrity_flagged is read.
 */
export async function runHealthCheck(supabase: SupabaseClient): Promise<HealthCheckSummary> {
  const { data: endpoints, error } = await supabase
    .from("endpoints")
    .select("id, title, health_check_url, consecutive_health_fails")
    .eq("is_active", true);

  if (error) {
    logger.error("health_check_endpoints_query_failed", { error: error.message });
    return { checked: 0, healthy: 0, unhealthy: 0, skipped_no_url: 0, results: [] };
  }

  const rows = (endpoints ?? []) as Array<{ id: string; title: string; health_check_url: string | null; consecutive_health_fails: number | null }>;

  const urlResults = new Map<string, boolean>();
  const uniqueUrls = [...new Set(rows.map((r) => r.health_check_url).filter((u): u is string => Boolean(u)))];
  await Promise.all(
    uniqueUrls.map(async (url) => {
      urlResults.set(url, await pingEndpoint(url));
    }),
  );

  const results: EndpointHealthResult[] = [];
  const now = new Date().toISOString();

  for (const row of rows) {
    if (!row.health_check_url) {
      logger.warn("health_check_skipped_no_url", { endpointId: row.id, title: row.title });
      continue;
    }

    const isHealthy = urlResults.get(row.health_check_url) ?? false;
    const priorFails = row.consecutive_health_fails ?? 0;
    const consecutiveFails = isHealthy ? 0 : priorFails + 1;
    const status: "healthy" | "unhealthy" = isHealthy ? "healthy" : "unhealthy";

    const { error: updateError } = await supabase
      .from("endpoints")
      .update({
        health_status: status,
        last_health_check_at: now,
        consecutive_health_fails: consecutiveFails,
      })
      .eq("id", row.id);

    if (updateError) {
      logger.error("health_check_update_failed", { endpointId: row.id, error: updateError.message });
      continue;
    }

    if (!isHealthy && consecutiveFails === CONSECUTIVE_FAILS_TO_FLAG) {
      logger.warn("endpoint_health_flagged", { endpointId: row.id, title: row.title, consecutiveFails });
    }

    results.push({ endpoint_id: row.id, title: row.title, health_check_url: row.health_check_url, health_status: status, consecutive_health_fails: consecutiveFails });
  }

  const summary: HealthCheckSummary = {
    checked: results.length,
    healthy: results.filter((r) => r.health_status === "healthy").length,
    unhealthy: results.filter((r) => r.health_status === "unhealthy").length,
    skipped_no_url: rows.length - results.length,
    results,
  };

  logger.info("health_check_completed", { checked: summary.checked, healthy: summary.healthy, unhealthy: summary.unhealthy, skippedNoUrl: summary.skipped_no_url });
  return summary;
}
