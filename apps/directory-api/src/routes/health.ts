import { Hono } from "hono";
import type { AppBindings } from "../types.js";

export const healthRoute = new Hono<AppBindings>();

healthRoute.get("/health", async (c) => {
  const supabase = c.get("supabase");
  const startedAt = Date.now();
  const { error } = await supabase.from("providers").select("id", { head: true, count: "exact" }).limit(1);

  const dbOk = !error;

  // Session 26 — Decision 54: endpoints in pending_recertification bypass
  // the integrity block during their 7-day update window. Surfaced here so
  // external monitors (and sbp-agent) can see the count without querying
  // Supabase directly. Informational only, not an alert state — a nonzero
  // count is expected/normal whenever a provider has an update in flight.
  // A failed count here degrades to `null`, same "don't block /health on a
  // secondary query" posture as the DB reachability check above.
  const { count: pendingRecertCount, error: pendingRecertError } = await supabase
    .from("endpoints")
    .select("id", { head: true, count: "exact" })
    .eq("pending_recertification", true)
    .eq("is_active", true);

  // Always 200: this route doubles as Railway's deploy/container healthcheck.
  // A Supabase outage means this service genuinely can't do its job — unlike
  // apps/pilot-endpoint's facilitator check, this isn't a "third-party SPOF
  // that doesn't affect the free routes" situation, most of this API's own
  // free routes need the DB too. But restarting the container fixes nothing
  // about an external Supabase outage, and a mid-deploy blip here shouldn't
  // block a healthy new revision from going live or trigger a restart loop.
  // Real alerting reads `database` from the body (CLAUDE.md Section 9: the
  // endpoint health checker cron + Supabase queries, not container orchestration).
  const agentWalletAddress = c.get("env").AGENT_WALLET_ADDRESS;
  const webAppUrl = c.get("env").WEB_APP_URL;
  const policyUrl = webAppUrl ? `${webAppUrl.replace(/\/$/, "")}/.well-known/volume-integrity-policy.json` : null;
  return c.json({
    status: dbOk ? "ok" : "degraded",
    service: "pdc-directory-api",
    network: c.get("env").ALGORAND_NETWORK,
    database: dbOk ? "reachable" : "unreachable",
    responseTimeMs: Date.now() - startedAt,
    endpoints: {
      pending_recertification: pendingRecertError ? null : (pendingRecertCount ?? 0),
    },
    // Volume Integrity Policy (Session 26) — sbp-agent's hourly queries are
    // SBP's own uptime monitoring, not organic buyer volume. On-chain
    // labelling isn't possible with the pinned x402 client SDK (see the doc
    // comment on createManualPaymentFetch in @pdc/x402-adapter); this wallet
    // address plus sbp-agent's own structured logs (event names
    // agent_directory_query_succeeded / agent_endpoint_query_succeeded,
    // field type: "canary") are how canary transactions are cross-referenced
    // instead.
    canary: {
      configured: Boolean(agentWalletAddress),
      wallet: agentWalletAddress ?? null,
      description: "Hourly self-funded uptime monitoring queries from SBP's own operational wallet.",
      // Session 27 — apps/web/public/.well-known/volume-integrity-policy.json.
      // null (not a 404-prone guess) until WEB_APP_URL is actually set.
      policy_url: policyUrl,
    },
    timestamp: new Date().toISOString(),
  });
});
