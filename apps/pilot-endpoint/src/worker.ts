import type { Hono } from "hono";
import type { ExecutionContext } from "@cloudflare/workers-types";
import { loadEnv } from "./types/env.js";
import { createApp } from "./app.js";
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
};
