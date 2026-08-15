import { serve } from "@hono/node-server";
import { loadEnv } from "./types/env.js";
import { logger } from "./lib/logger.js";
import { AGENT_REGISTRY, type AgentSlug } from "./agents/registry.js";
import type { AgentRuntimeConfig, RunnableAgent } from "./agents/base.js";
import { createApp } from "./app.js";

async function main(): Promise<void> {
  const env = loadEnv();

  const runtimeConfigFor = (agentId: string): AgentRuntimeConfig => ({
    agentId,
    directoryUrl: env.DIRECTORY_API_URL,
    agentWalletKey: env.AGENT_WALLET_KEY,
    network: env.ALGORAND_NETWORK,
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceKey: env.SUPABASE_SERVICE_KEY,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    claudeModel: env.CLAUDE_MODEL,
    internalApiKey: env.INTERNAL_API_KEY,
  });

  // Built once at startup, not per request — each agent's wallet address
  // derivation and payingFetch closure are cheap but pointless to redo per
  // call. An agent whose *_AGENT_ID env var isn't set yet (before
  // scripts/register-agents.ts has run) gets a null entry and its POST
  // route returns 503 rather than crashing the whole service at boot.
  const agentInstances = new Map<AgentSlug, RunnableAgent | null>(
    AGENT_REGISTRY.map((entry) => {
      const agentId = entry.agentIdFromEnv(env);
      if (!agentId) {
        logger.warn("agent_not_registered", {
          slug: entry.slug,
          hint: `Run scripts/register-agents.ts, then set ${entry.slug.toUpperCase()}_AGENT_ID`,
        });
        return [entry.slug, null];
      }
      return [entry.slug, entry.create(runtimeConfigFor(agentId))];
    }),
  );

  const app = createApp(env, agentInstances);

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info("agents_service_ready", {
      port: info.port,
      publicUrl: env.PUBLIC_URL,
      registeredAgents: [...agentInstances.entries()].filter(([, v]) => v != null).map(([k]) => k),
    });
  });
}

main();
