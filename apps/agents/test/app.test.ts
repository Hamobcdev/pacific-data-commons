import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { InsufficientDataError, SovereigntyBlockedError, type RunnableAgent } from "../src/agents/base.js";
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
    ANTHROPIC_API_KEY: "anthropic-key",
    CLAUDE_MODEL: "claude-sonnet-4-6",
    SUPABASE_URL: "https://supabase.example",
    SUPABASE_SERVICE_KEY: "service-key",
    MAX_REQUESTS_PER_MINUTE: 2,
    MAX_QUOTES_PER_HOUR: 20,
    MAX_EXECUTIONS_PER_HOUR: 10,
    ...overrides,
  };
}

function fakeAgentOutput(): AgentOutput {
  return {
    agent_type: "trade_intelligence",
    run_id: "run-1",
    dry_run: false,
    synthesis: "ok",
    citations: [],
    total_cost_usdc: 0.5,
    generated_at: new Date().toISOString(),
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

describe("GET /health, GET /agents", () => {
  it("returns 200 ok on /health", async () => {
    const app = createApp(fakeEnv(), emptyAgentMap());
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("lists all six agents with registered:false when no agent id is configured", async () => {
    const app = createApp(fakeEnv(), emptyAgentMap());
    const res = await app.request("/agents");
    const body = (await res.json()) as { agents: Array<{ id: string; registered: boolean }> };
    expect(body.agents).toHaveLength(6);
    expect(body.agents.every((a) => a.registered === false)).toBe(true);
  });
});

describe("POST /agents/trade — request validation", () => {
  it("returns 400 when user_wallet is missing", async () => {
    const app = createApp(fakeEnv(), emptyAgentMap());
    const res = await app.request("/agents/trade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parameters: { commodity: "tuna", country: "Samoa" }, dry_run: true }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("returns 400 when output_language is not English (R4)", async () => {
    const app = createApp(fakeEnv(), emptyAgentMap());
    const res = await app.request("/agents/trade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        parameters: { commodity: "tuna", country: "Samoa" },
        dry_run: true,
        user_wallet: "USERWALLET",
        output_language: "sm",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 503 when the agent hasn't been registered yet", async () => {
    const app = createApp(fakeEnv(), emptyAgentMap());
    const res = await app.request("/agents/trade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parameters: { commodity: "tuna", country: "Samoa" }, dry_run: true, user_wallet: "USERWALLET" }),
    });
    expect(res.status).toBe(503);
  });
});

describe("POST /agents/trade — with a registered agent", () => {
  function agentMapWith(agent: RunnableAgent): Map<AgentSlug, RunnableAgent | null> {
    const map = emptyAgentMap();
    map.set("trade", agent);
    return map;
  }

  it("returns 200 and the preview on a dry run", async () => {
    const agent: RunnableAgent = { run: async () => fakeAgentOutput(), walletAddress: "FAKEAGENTWALLETADDRESS" };
    const app = createApp(fakeEnv(), agentMapWith(agent));

    const res = await app.request("/agents/trade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parameters: { commodity: "tuna", country: "Samoa" }, dry_run: true, user_wallet: "USERWALLET" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as AgentOutput;
    expect(body.run_id).toBe("run-1");
  });

  it("returns 402 payment_required for a live run (dry_run: false) — Session 16 gate", async () => {
    const agent: RunnableAgent = { run: async () => fakeAgentOutput(), walletAddress: "FAKEAGENTWALLETADDRESS" };
    const app = createApp(fakeEnv(), agentMapWith(agent));

    const res = await app.request("/agents/trade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parameters: { commodity: "tuna", country: "Samoa" }, dry_run: false, user_wallet: "USERWALLET" }),
    });

    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("payment_required");
  });

  it("maps InsufficientDataError to 422 insufficient_data", async () => {
    const agent: RunnableAgent = {
      run: async () => {
        throw new InsufficientDataError("trade");
      },
      walletAddress: "FAKEAGENTWALLETADDRESS",
    };
    const app = createApp(fakeEnv(), agentMapWith(agent));

    const res = await app.request("/agents/trade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parameters: { commodity: "tuna", country: "Samoa" }, dry_run: true, user_wallet: "USERWALLET" }),
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("insufficient_data");
  });

  it("maps SovereigntyBlockedError to 403 sovereignty_blocked", async () => {
    const agent: RunnableAgent = {
      run: async () => {
        throw new SovereigntyBlockedError("Test Endpoint", "no permitted_use_cases declared");
      },
      walletAddress: "FAKEAGENTWALLETADDRESS",
    };
    const app = createApp(fakeEnv(), agentMapWith(agent));

    const res = await app.request("/agents/trade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parameters: { commodity: "tuna", country: "Samoa" }, dry_run: true, user_wallet: "USERWALLET" }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("sovereignty_blocked");
  });

  it("rate limits a wallet after MAX_REQUESTS_PER_MINUTE requests (fakeEnv sets it to 2)", async () => {
    const agent: RunnableAgent = { run: async () => fakeAgentOutput(), walletAddress: "FAKEAGENTWALLETADDRESS" };
    const app = createApp(fakeEnv(), agentMapWith(agent));
    const requestBody = JSON.stringify({ parameters: { commodity: "tuna", country: "Samoa" }, dry_run: true, user_wallet: "RATE_LIMITED_WALLET" });

    const first = await app.request("/agents/trade", { method: "POST", headers: { "content-type": "application/json" }, body: requestBody });
    const second = await app.request("/agents/trade", { method: "POST", headers: { "content-type": "application/json" }, body: requestBody });
    const third = await app.request("/agents/trade", { method: "POST", headers: { "content-type": "application/json" }, body: requestBody });

    expect(first.status).not.toBe(429);
    expect(second.status).not.toBe(429);
    expect(third.status).toBe(429);
  });
});
