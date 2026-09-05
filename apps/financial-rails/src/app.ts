import { Hono } from "hono";
import type { Env } from "./lib/env.js";
import { createSupabaseClient } from "./lib/supabase.js";
import { logger } from "./lib/logger.js";
import { financialRailsAuth } from "./middleware/financialRailsAuth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { reservesRoute } from "./routes/reserves.js";
import { providersRoute } from "./routes/providers.js";
import { cbsOversightRoute } from "./routes/cbsOversight.js";
import { escrowRoute } from "./routes/escrow.js";
import type { AppBindings } from "./types.js";

/**
 * Session 39 — CBS Financial Rails. Internal-only service: no public
 * domain (see railway.json / wrangler.toml — Session 40 migrates this to a
 * Cloudflare Worker with no custom domain, reachable only at its
 * workers.dev URL), no CORS (no browser ever calls this directly —
 * Component B's dashboard fetches server-side only, see apps/web's
 * ADMIN_FINANCIAL_RAILS data-fetch module), every route except /health
 * gated by financialRailsAuth. This isolation is deliberate (CLAUDE.md
 * Section 4 P4, Session 39 build prompt "why two components"): this
 * service will eventually hold CBS signing keys and real monetary
 * positions, so a vulnerability in the public-facing directory-api must
 * not be able to reach financial rail data.
 *
 * Pure with respect to runtime (no process.env access, no listen/serve
 * call) so the identical app can be driven by Node's @hono/node-server
 * (index.ts, local dev) or Cloudflare Workers' fetch handler (worker.ts,
 * Session 40 Cloudflare migration) — env is passed in by whichever entry
 * point loaded it.
 */
export function createApp(env: Env) {
  const supabase = createSupabaseClient(env);

  const app = new Hono<AppBindings>();

  app.use("*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("env", env);
    await next();
  });

  // Session 39 preamble: "Log every request with timestamp, route, and
  // calling service." `caller` is best-effort — the only identity a
  // service-to-service Bearer-key caller offers today is whatever it puts
  // in this header; unset is logged as "unknown" rather than causing the
  // request to be dropped, since request-attribution here is an audit
  // convenience, not the authorization mechanism (financialRailsAuth is).
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    logger.info("financial_rails_request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      caller: c.req.header("x-calling-service") ?? "unknown",
      duration_ms: Date.now() - start,
    });
  });

  app.get("/health", (c) => c.json({ status: "ok", service: "sbp-financial-rails", stub: true }));

  app.use("/reserves/*", financialRailsAuth);
  app.use("/providers/*", financialRailsAuth);
  app.use("/cbs-oversight/*", financialRailsAuth);
  app.use("/escrow/*", financialRailsAuth);

  app.route("/", reservesRoute);
  app.route("/", providersRoute);
  app.route("/", cbsOversightRoute);
  app.route("/", escrowRoute);

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}
