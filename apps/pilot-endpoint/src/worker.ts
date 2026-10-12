import type { Hono } from "hono";
import type { ExecutionContext, ScheduledController } from "@cloudflare/workers-types";
import { loadEnv } from "./types/env.js";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import type { AppBindings } from "./types.js";

// Cloudflare Workers entry point (Session 40 migration). Mirrors index.ts
// but has no port to listen on — the platform delivers requests straight
// to fetch(). Workers env vars/secrets arrive as the second fetch()
// argument, not process.env, so this cannot call loadEnv() with its
// process.env default the way index.ts does; loadEnv() already accepts an
// arbitrary source object, so the Workers `env` binding is passed there
// directly instead.
//
// App construction (including the async facilitator-health check and
// boot-time directory-context sanity check in app.ts) is deferred to the
// first request rather than done at module top level: Workers only
// guarantees the `env` bindings are populated inside the fetch handler, not
// during the module's global-scope evaluation on cold start. The built app
// is cached for the lifetime of this isolate (loadEnv's own module-level
// cache does the same for the parsed env), so this only re-runs once per
// cold start, not per request.
let cachedAppPromise: Promise<Hono<AppBindings>> | undefined;

export default {
  async fetch(request: Request, cfEnv: Record<string, string>, ctx: ExecutionContext): Promise<Response> {
    if (!cachedAppPromise) {
      const env = loadEnv(cfEnv as unknown as NodeJS.ProcessEnv);
      cachedAppPromise = createApp(env);
    }
    const app = await cachedAppPromise;
    return app.fetch(request, cfEnv, ctx);
  },

  // Cloudflare Cron Trigger (wrangler.toml [triggers], */4 * * * *) — same
  // keep-warm pattern as apps/directory-api's worker.ts (PR #143). Fires
  // every 4 minutes through the real fetch() path (not just a log-and-
  // return) against this service's own /summary route, so the payment
  // gate's one-time Bazaar/Ajv self-check and facilitator getSupported()
  // call actually run on an otherwise-idle isolate, instead of only ever
  // running on whichever real buyer request happens to hit a cold one
  // first. /summary is itself x402-gated — this ping carries no payment,
  // so it resolves as a normal 402 (or the gate's own 503 if the self-check
  // genuinely times out), never throwing; either outcome still exercises
  // the cold-start path this cron exists to pre-empt before a real buyer
  // does. ctx.waitUntil() lets the fetch run past the point this handler
  // would otherwise return, per the Workers scheduled-handler contract.
  async scheduled(controller: ScheduledController, cfEnv: Record<string, string>, ctx: ExecutionContext): Promise<void> {
    if (controller.cron !== "*/4 * * * *") return;

    if (!cachedAppPromise) {
      const env = loadEnv(cfEnv as unknown as NodeJS.ProcessEnv);
      cachedAppPromise = createApp(env);
    }
    const app = await cachedAppPromise;
    const warmReq = new Request("https://pdc-pilot-endpoint.synergyblockchaintf.workers.dev/summary");
    ctx.waitUntil(
      (async () => {
        try {
          await app.fetch(warmReq, cfEnv, ctx);
          logger.info("keep-warm ping", { status: "ok" });
        } catch (error) {
          logger.error("keep-warm ping failed", { error: error instanceof Error ? error.message : String(error) });
        }
      })(),
    );
  },
};
