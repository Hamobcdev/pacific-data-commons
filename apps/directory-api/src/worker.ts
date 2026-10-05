import type { Hono } from "hono";
import type { ExecutionContext, KVNamespace, ScheduledController } from "@cloudflare/workers-types";
import { loadEnv } from "./lib/env.js";
import { createApp } from "./app.js";
import { runCronCryptoPriceFetch } from "./handlers/cronCryptoPriceFetcher.js";
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
// App construction is deferred to the first request rather than done at
// module top level: Workers only guarantees the `env` bindings are
// populated inside the fetch handler, not during the module's global-scope
// evaluation on cold start. The built app is then cached for the lifetime
// of this isolate (loadEnv's own module-level cache does the same for the
// parsed env), so this only re-runs once per cold start, not per request.
let cachedApp: Hono<AppBindings> | undefined;

// cfEnv carries both string vars/secrets (consumed by loadEnv()) and the
// CRYPTO_PRICES_KV binding (a KVNamespace object, not a string) — can't be
// typed as Record<string, string> like the rest of this object once a
// non-string binding exists. `[key: string]: unknown` keeps every other
// key's existing "pass straight through to loadEnv, which validates it"
// behaviour unchanged.
interface WorkerBindings {
  [key: string]: unknown;
  CRYPTO_PRICES_KV?: KVNamespace;
}

export default {
  fetch(request: Request, cfEnv: WorkerBindings, ctx: ExecutionContext): Response | Promise<Response> {
    if (!cachedApp) {
      const env = loadEnv(cfEnv as unknown as NodeJS.ProcessEnv);
      cachedApp = createApp(env, cfEnv.CRYPTO_PRICES_KV);
    }
    return cachedApp.fetch(request, cfEnv, ctx);
  },

  // Cloudflare Cron Trigger (wrangler.toml [triggers], */5 * * * *) — keeps
  // CRYPTO_PRICES_KV's "prices:current" and "history:{SYMBOL}" entries
  // fresh so /finance/crypto-rates and /finance/crypto-history never call
  // an upstream price API on the request path. ctx.waitUntil() lets the
  // fetch run past the point this handler would otherwise return, per the
  // Workers scheduled-handler contract.
  scheduled(controller: ScheduledController, cfEnv: WorkerBindings, ctx: ExecutionContext): void {
    if (!cfEnv.CRYPTO_PRICES_KV) {
      logger.error("crypto_price_cron_missing_kv_binding", { cron: controller.cron });
      return;
    }
    ctx.waitUntil(runCronCryptoPriceFetch(cfEnv.CRYPTO_PRICES_KV));
  },
};
