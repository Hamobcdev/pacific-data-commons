import { serve } from "@hono/node-server";
import { loadEnv } from "./types/env.js";
import { logger } from "./lib/logger.js";
import { createApp } from "./app.js";

// Node local-dev entry point (Session 40 Cloudflare migration split — see
// app.ts's doc comment). Production runs via worker.ts on Cloudflare
// Workers instead; this file is kept for `pnpm dev` / `pnpm start`.
async function main(): Promise<void> {
  const env = loadEnv();
  const app = await createApp(env);

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info("pilot_endpoint_ready", { port: info.port, publicUrl: env.PUBLIC_URL });
  });
}

main();
