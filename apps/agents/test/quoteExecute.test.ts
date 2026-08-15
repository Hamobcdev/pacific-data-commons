import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { RunnableAgent } from "../src/agents/base.js";
import type { AgentSlug } from "../src/agents/registry.js";
import type { Env } from "../src/types/env.js";
import type { AgentOutput } from "@pdc/shared-types";

function fakeEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "test",
    PORT: 4023,
    PUBLIC_URL: "http://localhost:4023",
    LOG_LEVEL: "info",
    AGENT_WALLET_KEY: Buffer.alloc(64, 1).toString("base64"),
    ALGORAND_NETWORK: "mainnet",
    ALGORAND_NODE_URL: "https://mainnet-api.algonode.cloud",
    ALGORAND_INDEXER_URL: "https://mainnet-idx.algonode.cloud",
    DIRECTORY_API_URL: "https://directory.example",
    INTERNAL_API_KEY: "internal-key",
    ANTHROPIC_API_KEY: "anthropic-key",
    CLAUDE_MODEL: "claude-sonnet-4-6",
    SUPABASE_URL: "https://supabase.example",
    SUPABASE_SERVICE_KEY: "service-key",
    MAX_REQUESTS_PER_MINUTE: 10,
    MAX_QUOTES_PER_HOUR: 20,
    MAX_EXECUTIONS_PER_HOUR: 10,
    ...overrides,
  };
}

function emptyAgentMap(): Map<AgentSlug, RunnableAgent | null> {
  return new Map<AgentSlug, RunnableAgent | null>([
    ["trade", null],
    ["climate", null],
    ["fisheries", null],
    ["agricultural", null],
    ["remittance", null],
    ["grants", null],
  ]);
}

function fakeDryRunOutput(): AgentOutput {
  return {
    agent_type: "trade_intelligence",
    run_id: "run-1",
    dry_run: true,
    preview: {
      endpoints_to_query: [
        { endpoint_id: "end-1", title: "Trade Stats", tier: 1, price_usdc: 0.5, reason: "trade data" },
        { endpoint_id: "end-2", title: "Demographics", tier: 1, price_usdc: 0.25, reason: "demographics data" },
      ],
      estimated_cost_usdc: 0.75,
      output_shape: "a report",
    },
    citations: [],
    total_cost_usdc: 0,
    generated_at: new Date().toISOString(),
  };
}

describe("POST /agents/:agentId/quote", () => {
  function agentMapWith(agent: RunnableAgent): Map<AgentSlug, RunnableAgent | null> {
    const map = emptyAgentMap();
    map.set("trade", agent);
    return map;
  }

  it("applies the agent's markup on top of the dry-run subtotal and returns a quote", async () => {
    const agent: RunnableAgent = { run: async () => fakeDryRunOutput(), walletAddress: "AGENTWALLETADDR" };
    const app = createApp(fakeEnv(), agentMapWith(agent));

    const res = await app.request("/agents/trade/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parameters: { commodity: "tuna", country: "Samoa" }, user_wallet: "USERWALLET" }),
    });

    expect(res.status).toBe(200);
    const quote = (await res.json()) as {
      quote_id: string;
      subtotal_usdc: number;
      markup_pct: number;
      markup_usdc: number;
      total_usdc: number;
      pay_to_address: string;
      quote_expires_at: string;
    };
    // Trade's markupPct is 20 (packages/shared-types/src/agent-registry.ts).
    expect(quote.subtotal_usdc).toBe(0.75);
    expect(quote.markup_pct).toBe(20);
    expect(quote.markup_usdc).toBe(0.15);
    expect(quote.total_usdc).toBe(0.9);
    expect(quote.pay_to_address).toBe("AGENTWALLETADDR");
    expect(new Date(quote.quote_expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("returns 503 when the agent hasn't been registered yet", async () => {
    const app = createApp(fakeEnv(), emptyAgentMap());
    const res = await app.request("/agents/trade/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parameters: {}, user_wallet: "USERWALLET" }),
    });
    expect(res.status).toBe(503);
  });

  it("returns 400 when user_wallet is missing", async () => {
    const app = createApp(fakeEnv(), emptyAgentMap());
    const res = await app.request("/agents/trade/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parameters: {} }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /agents/:agentId/execute — validation before payment verification", () => {
  function agentMapWith(agent: RunnableAgent): Map<AgentSlug, RunnableAgent | null> {
    const map = emptyAgentMap();
    map.set("trade", agent);
    return map;
  }

  it("returns 404 for an unknown quote_id", async () => {
    const agent: RunnableAgent = { run: async () => fakeDryRunOutput(), walletAddress: "AGENTWALLETADDR" };
    const app = createApp(fakeEnv(), agentMapWith(agent));

    const res = await app.request("/agents/trade/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quote_id: "00000000-0000-0000-0000-000000000000", tx_id: "SOMETXID" }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("quote_not_found");
  });

  it("returns 400 when quote_id is not a valid UUID", async () => {
    const app = createApp(fakeEnv(), emptyAgentMap());
    const res = await app.request("/agents/trade/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quote_id: "not-a-uuid", tx_id: "SOMETXID" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when a quote is redeemed against the wrong agent", async () => {
    const agent: RunnableAgent = { run: async () => fakeDryRunOutput(), walletAddress: "AGENTWALLETADDR" };
    const app = createApp(fakeEnv(), agentMapWith(agent));

    const quoteRes = await app.request("/agents/trade/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parameters: {}, user_wallet: "USERWALLET" }),
    });
    const quote = (await quoteRes.json()) as { quote_id: string };

    // fisheries has no agent registered in this map either, but the
    // agent-mismatch check runs before the "is it registered" check.
    const res = await app.request("/agents/fisheries/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quote_id: quote.quote_id, tx_id: "SOMETXID" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("quote_agent_mismatch");
  });
});
