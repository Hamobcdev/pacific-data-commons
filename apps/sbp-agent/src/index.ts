import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";
import { getWalletStatus } from "./wallet.js";
import { runQueryCycle, type CycleResult } from "./agent.js";
import { getAgentWalletKey } from "./key-provider.js";

/**
 * Resolves the agent wallet key fresh from AWS Secrets Manager (or the
 * AGENT_WALLET_KEY env var fallback) — never cached at module scope, called
 * once per signing operation (Session 8, Priority 1). A resolution failure
 * degrades to the pre-existing dry-run behaviour rather than crashing the
 * service: sbp-agent generates competition leaderboard volume on an hourly
 * loop, so a transient AWS outage should log and skip a cycle, not take the
 * whole process down.
 */
async function resolveAgentWalletKey(): Promise<string | undefined> {
  try {
    return await getAgentWalletKey();
  } catch (err) {
    logger.warn("agent_wallet_key_unavailable", {
      error: err instanceof Error ? err.message : String(err),
      action: "falling back to dry-run mode for this check/cycle",
    });
    return undefined;
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const intervalMs = env.QUERY_INTERVAL_MINUTES * 60_000;

  const startupKey = await resolveAgentWalletKey();
  const wallet = await getWalletStatus({
    agentWalletKey: startupKey,
    algorandNetwork: env.ALGORAND_NETWORK,
    algorandNodeUrl: env.ALGORAND_NODE_URL,
  });

  logger.info("sbp_agent_starting", {
    interval_minutes: env.QUERY_INTERVAL_MINUTES,
    dry_run: !wallet.configured,
    directory_url: env.DIRECTORY_URL,
    wallet_address: wallet.address,
    wallet_usdc_balance: wallet.usdcBalanceUsdc,
    wallet_error: wallet.error,
    key_source: process.env.AWS_ACCESS_KEY_ID ? "aws_secrets_manager" : "env_var",
  });

  if (wallet.configured && (wallet.usdcBalanceUsdc === null || wallet.usdcBalanceUsdc <= 0)) {
    logger.warn("agent_wallet_underfunded", {
      address: wallet.address,
      usdc_balance: wallet.usdcBalanceUsdc,
      action: "cycles will attempt payment and fail at settlement — top up the agent wallet",
    });
  }

  let lastCycle: CycleResult | undefined;

  async function tick(): Promise<void> {
    // Retrieved fresh every cycle, not reused from startup — this is the
    // "per-operation retrieval" AWS Secrets Manager is here for.
    const agentWalletKey = await resolveAgentWalletKey();
    lastCycle = await runQueryCycle({
      directoryUrl: env.DIRECTORY_URL,
      agentWalletKey,
      network: env.ALGORAND_NETWORK,
      logger,
    });
  }

  // Run immediately on startup, then on the configured schedule.
  await tick();
  setInterval(() => {
    tick().catch((err: unknown) => {
      logger.error("agent_cycle_unhandled_error", { error: err instanceof Error ? err.message : String(err) });
    });
  }, intervalMs);

  // Railway requires a port even for background workers — this also gives
  // operators a live look at the last cycle without grepping logs.
  const app = new Hono();
  app.get("/health", (c) =>
    c.json({
      status: "ok",
      dry_run: !wallet.configured,
      wallet_address: wallet.address,
      directory_url: env.DIRECTORY_URL,
      interval_minutes: env.QUERY_INTERVAL_MINUTES,
      last_cycle: lastCycle ?? null,
    }),
  );

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info("sbp_agent_ready", { port: info.port });
  });
}

main();
