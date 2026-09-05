import { serve } from "@hono/node-server";
import { loadEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { createApp } from "./app.js";

// Node local-dev entry point (Session 40 Cloudflare migration split — see
// app.ts's doc comment). Production runs via worker.ts on Cloudflare
// Workers instead; this file is kept for `pnpm dev` / `pnpm start`.
function main(): void {
  const env = loadEnv();
  const app = createApp(env);

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info("financial_rails_listening", { port: info.port, node_env: env.NODE_ENV });
  });
}

main();
