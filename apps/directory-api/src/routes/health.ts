import { Hono } from "hono";
import type { AppBindings } from "../types.js";

export const healthRoute = new Hono<AppBindings>();

healthRoute.get("/health", async (c) => {
  const supabase = c.get("supabase");
  const startedAt = Date.now();
  const { error } = await supabase.from("providers").select("id", { head: true, count: "exact" }).limit(1);

  const dbOk = !error;
  // Always 200: this route doubles as Railway's deploy/container healthcheck.
  // A Supabase outage means this service genuinely can't do its job — unlike
  // apps/pilot-endpoint's facilitator check, this isn't a "third-party SPOF
  // that doesn't affect the free routes" situation, most of this API's own
  // free routes need the DB too. But restarting the container fixes nothing
  // about an external Supabase outage, and a mid-deploy blip here shouldn't
  // block a healthy new revision from going live or trigger a restart loop.
  // Real alerting reads `database` from the body (CLAUDE.md Section 9: the
  // endpoint health checker cron + Supabase queries, not container orchestration).
  return c.json({
    status: dbOk ? "ok" : "degraded",
    service: "pdc-directory-api",
    network: c.get("env").ALGORAND_NETWORK,
    database: dbOk ? "reachable" : "unreachable",
    responseTimeMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  });
});
