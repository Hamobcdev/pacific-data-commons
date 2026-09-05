import type { Hono } from "hono";
import type { ExecutionContext } from "@cloudflare/workers-types";
import { loadEnv } from "./lib/env.js";
import { createApp } from "./app.js";
import type { AppBindings } from "./types.js";

// Cloudflare Workers entry point (Session 40 migration). No public custom
// domain — reachable only at pdc-financial-rails.synergyblockchaintf.workers.dev,
// same internal-only posture as the Railway deployment (see app.ts's doc
// comment). Workers env vars/secrets arrive as the second fetch() argument,
// not process.env, so loadEnv() (which already accepts an arbitrary source
// object) is called with the Workers `env` binding directly instead of its
// process.env default. App construction is deferred to the first request —
// Workers only guarantees `env` bindings are populated inside the fetch
// handler, not during module-scope evaluation on cold start — then cached
// for the isolate's lifetime.
let cachedApp: Hono<AppBindings> | undefined;

export default {
  fetch(request: Request, cfEnv: Record<string, string>, ctx: ExecutionContext): Response | Promise<Response> {
    if (!cachedApp) {
      const env = loadEnv(cfEnv as unknown as NodeJS.ProcessEnv);
      cachedApp = createApp(env);
    }
    return cachedApp.fetch(request, cfEnv, ctx);
  },
};
