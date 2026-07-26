import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";
import { getWalletStatus } from "./wallet.js";
import { runQueryCycle, type CycleResult } from "./agent.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const intervalMs = env.QUERY_INTERVAL_MINUTES * 60_000;

  const wallet = await getWalletStatus({
    agentWalletKey: env.AGENT_WALLET_KEY,
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
    lastCycle = await runQueryCycle({
      directoryUrl: env.DIRECTORY_URL,
      agentWalletKey: env.AGENT_WALLET_KEY,
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
