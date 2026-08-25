// Redeploy trigger: comment-only change, picks up the build:sbp-agent shared-types fix.
import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";
import { getWalletStatus } from "./wallet.js";
import {
  runQueryCycle,
  runWalletBalanceCanaryCheck,
  runFxCanaryCheck,
  runOrchestratorCanaryCheck,
  type CycleResult,
  type WalletBalanceCanaryResult,
  type FxCanaryResult,
  type OrchestratorCanaryResult,
} from "./agent.js";
import { getAgentWalletKey } from "./key-provider.js";
import { ensureAgentRegistered } from "./lib/self-register.js";
import { submitAttribution } from "./lib/attribution.js";

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

  // Session 14 — both pilot endpoints (fisheries, ocean) are queried every
  // tick, not just SEARCH_CATEGORY, so a single deployment generates
  // leaderboard volume against everything currently live rather than one
  // category. Deduplicated so setting SEARCH_CATEGORY=ocean doesn't query
  // ocean twice.
  const categories = Array.from(new Set([env.SEARCH_CATEGORY, "ocean"]));

  const startupKey = await resolveAgentWalletKey();
  const wallet = await getWalletStatus({
    agentWalletKey: startupKey,
    algorandNetwork: env.ALGORAND_NETWORK,
    algorandNodeUrl: env.ALGORAND_NODE_URL,
  });

  logger.info("sbp_agent_starting", {
    interval_minutes: env.QUERY_INTERVAL_MINUTES,
    categories,
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
  } else if (wallet.configured && wallet.usdcBalanceUsdc !== null && wallet.usdcBalanceUsdc < 0.5) {
    // Session 16 — earlier warning than agent_wallet_underfunded above:
    // flags the wallet while it can still run cycles, not just once it's
    // already exhausted.
    logger.warn("agent_wallet_low_balance", {
      address: wallet.address,
      usdc_balance: wallet.usdcBalanceUsdc,
      action: "top up from the PayTo wallet before balance reaches zero — agent will fail when USDC exhausted",
    });
  }

  // Session 19 (Decision 37) — provisions this agent's `agents` row so it
  // can submit attribution records after each cycle. Only attempted when
  // there's a real wallet to register (dry-run has no operational wallet
  // address to attribute payments to) and INTERNAL_API_KEY is configured;
  // either missing degrades to "no attribution submitted", not a boot
  // failure — see ensureAgentRegistered's doc comment.
  const agentId =
    wallet.configured && wallet.address && env.INTERNAL_API_KEY
      ? await ensureAgentRegistered({
          directoryUrl: env.DIRECTORY_URL,
          internalApiKey: env.INTERNAL_API_KEY,
          operationalWalletAddress: wallet.address,
          logger,
        })
      : undefined;

  if (wallet.configured && !agentId) {
    logger.warn("agent_attribution_disabled", {
      reason: env.INTERNAL_API_KEY ? "self-registration failed" : "INTERNAL_API_KEY not set",
      action: "cycles will still run and pay — Decision 37 attribution records will not be submitted",
    });
  }

  let lastCycles: CycleResult[] = [];
  let lastWalletBalanceCheck: WalletBalanceCanaryResult | null = null;
  let lastFxCheck: FxCanaryResult | null = null;
  let lastOrchestratorCheck: OrchestratorCanaryResult | null = null;

  async function tick(): Promise<void> {
    // Retrieved fresh every cycle, not reused from startup — this is the
    // "per-operation retrieval" AWS Secrets Manager is here for.
    const agentWalletKey = await resolveAgentWalletKey();
    // Sequential, not Promise.all — the agent wallet's payments settle one
    // at a time; parallel signing against the same key adds settlement
    // ordering risk for no benefit at this query volume.
    const results: CycleResult[] = [];
    for (const category of categories) {
      const result = await runQueryCycle({
        directoryUrl: env.DIRECTORY_URL,
        category,
        agentWalletKey,
        network: env.ALGORAND_NETWORK,
        logger,
        walletAddress: wallet.address,
      });
      results.push(result);

      // One attribution record per category-cycle (its own natural "run" —
      // its own directory query + endpoint query, own tx ids), covering
      // whichever of the two payments actually settled. No separate
      // "originating user" exists for this agent's own dogfooding
      // volume — see attribution.ts's hashUserWallet doc comment — so it
      // attributes to itself.
      if (!result.dry_run && agentId && agentWalletKey && wallet.address) {
        const endpointTxIds = [result.directory_query.tx_id, result.endpoint_query.tx_id].filter((id): id is string => id !== null);
        const attribution = await submitAttribution({
          directoryApiUrl: env.DIRECTORY_URL,
          agentWalletKeyBase64: agentWalletKey,
          agentOperationalWalletAddress: wallet.address,
          agentId,
          runId: randomUUID(),
          endpointTxIds,
          originatingUserWallet: wallet.address,
        });
        if (!attribution.success) {
          logger.warn("agent_attribution_submission_failed", { category, error: attribution.error });
        }
      }
    }
    lastCycles = results;

    // Session 29 — once per tick, not once per category like the loop
    // above: GET /algorand/wallet-balance is a single category-agnostic
    // utility endpoint, not a per-category directory+endpoint pair.
    const walletBalanceResult = await runWalletBalanceCanaryCheck({
      directoryUrl: env.DIRECTORY_URL,
      agentWalletKey,
      network: env.ALGORAND_NETWORK,
      logger,
      walletAddress: wallet.address,
    });
    lastWalletBalanceCheck = walletBalanceResult;

    if (!walletBalanceResult.dry_run && walletBalanceResult.tx_id && agentId && agentWalletKey && wallet.address) {
      const attribution = await submitAttribution({
        directoryApiUrl: env.DIRECTORY_URL,
        agentWalletKeyBase64: agentWalletKey,
        agentOperationalWalletAddress: wallet.address,
        agentId,
        runId: randomUUID(),
        endpointTxIds: [walletBalanceResult.tx_id],
        originatingUserWallet: wallet.address,
      });
      if (!attribution.success) {
        logger.warn("agent_attribution_submission_failed", { context: "wallet_balance_canary", error: attribution.error });
      }
    }

    // Session 30 — once per tick, same "single category-agnostic utility
    // endpoint" posture as the wallet-balance canary above.
    const fxResult = await runFxCanaryCheck({
      directoryUrl: env.DIRECTORY_URL,
      agentWalletKey,
      network: env.ALGORAND_NETWORK,
      logger,
      walletAddress: wallet.address,
    });
    lastFxCheck = fxResult;

    if (!fxResult.dry_run && fxResult.tx_id && agentId && agentWalletKey && wallet.address) {
      const attribution = await submitAttribution({
        directoryApiUrl: env.DIRECTORY_URL,
        agentWalletKeyBase64: agentWalletKey,
        agentOperationalWalletAddress: wallet.address,
        agentId,
        runId: randomUUID(),
        endpointTxIds: [fxResult.tx_id],
        originatingUserWallet: wallet.address,
      });
      if (!attribution.success) {
        logger.warn("agent_attribution_submission_failed", { context: "fx_canary", error: attribution.error });
      }
    }

    // Session 31 — once per tick, same "single category-agnostic utility
    // endpoint" posture as the wallet-balance/fx canaries above.
    const orchestratorResult = await runOrchestratorCanaryCheck({
      directoryUrl: env.DIRECTORY_URL,
      agentWalletKey,
      network: env.ALGORAND_NETWORK,
      logger,
      walletAddress: wallet.address,
    });
    lastOrchestratorCheck = orchestratorResult;

    if (!orchestratorResult.dry_run && orchestratorResult.tx_id && agentId && agentWalletKey && wallet.address) {
      const attribution = await submitAttribution({
        directoryApiUrl: env.DIRECTORY_URL,
        agentWalletKeyBase64: agentWalletKey,
        agentOperationalWalletAddress: wallet.address,
        agentId,
        runId: randomUUID(),
        endpointTxIds: [orchestratorResult.tx_id],
        originatingUserWallet: wallet.address,
      });
      if (!attribution.success) {
        logger.warn("agent_attribution_submission_failed", { context: "orchestrator_canary", error: attribution.error });
      }
    }
  }

  // Railway requires a port even for background workers — this also gives
  // operators a live look at the last cycle without grepping logs.
  //
  // Started before the first tick() below (not after) — Railway's
  // healthcheck window is 30 seconds, and a tick can run well past that
  // (multiple sequential x402 payments plus, for the orchestrator canary,
  // a Claude synthesis call). The server must be listening and answering
  // /health immediately at boot; the first tick then runs as soon as the
  // event loop is free, not before.
  const app = new Hono();
  app.get("/health", (c) =>
    c.json({
      status: "ok",
      dry_run: !wallet.configured,
      wallet_address: wallet.address,
      directory_url: env.DIRECTORY_URL,
      interval_minutes: env.QUERY_INTERVAL_MINUTES,
      categories,
      last_cycles: lastCycles,
      last_wallet_balance_check: lastWalletBalanceCheck,
      last_fx_check: lastFxCheck,
      last_orchestrator_check: lastOrchestratorCheck,
    }),
  );

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info("sbp_agent_ready", { port: info.port });
  });

  // Run immediately after the server is listening, then on the configured schedule.
  await tick();
  setInterval(() => {
    tick().catch((err: unknown) => {
      logger.error("agent_cycle_unhandled_error", { error: err instanceof Error ? err.message : String(err) });
    });
  }, intervalMs);
}

main();
