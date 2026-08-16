import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AgentType, DataCategory } from "@pdc/shared-types";
import { BaseAgent, InsufficientDataError, SovereigntyBlockedError, type AgentRuntimeConfig } from "../src/agents/base.js";
import type { AgentWallet, DirectoryEndpointResult, PDCQueryResult } from "../src/lib/pdcClient.js";

class TestAgent extends BaseAgent {
  agentType: AgentType = "trade_intelligence";
  requiredCategories: DataCategory[] = ["trade"];
  inputSchema = z.object({ commodity: z.string().min(1) });

  synthesisPrompt(data: Record<string, unknown>[]): string {
    return `synthesize: ${JSON.stringify(data)}`;
  }
}

function fakeEndpoint(overrides: Partial<DirectoryEndpointResult> = {}): DirectoryEndpointResult {
  return {
    endpoint_id: "end-1",
    endpoint_url: "https://provider.example/api",
    integrity_url: "https://provider.example/integrity",
    pending_recertification: false,
    title: "Test Endpoint",
    category: "trade",
    countries: ["Samoa"],
    provider_institution: "Test Institution",
    trust_tier: "silver",
    pricing_tiers: [{ tier: 1, name: "Summary", description: "Summary", price_usdc: 0.5, path: "/summary" }],
    indigenous_data_flag: false,
    cultural_sensitivity: "none",
    permitted_use_cases: ["commercial"],
    ...overrides,
  };
}

function fakeWallet(): AgentWallet {
  return { address: "AGENTOPERATIONALWALLETADDR", payingFetch: vi.fn() as unknown as typeof fetch };
}

const config: AgentRuntimeConfig = {
  agentId: "11111111-1111-1111-1111-111111111111",
  directoryUrl: "https://directory.example",
  agentWalletKey: Buffer.alloc(64, 7).toString("base64"),
  network: "mainnet",
  supabaseUrl: "https://supabase.example",
  supabaseServiceKey: "service-key",
  anthropicApiKey: "anthropic-key",
  claudeModel: "claude-sonnet-4-6",
  internalApiKey: "internal-key",
};

/** Session 17 — passes every live-run integrity check by default so the
 * pre-existing tests below (written before Session 17) don't make a real
 * network call against the fake directory.example / provider.example.org
 * URLs. Dedicated integrity-gating behaviour is covered in
 * base.integrity.test.ts. */
function passingIntegrityCheck() {
  return vi.fn().mockResolvedValue({
    passed: true,
    status: "no_cert_hash",
    expectedHash: null,
    actualHash: null,
    message: "no active certificate",
  });
}

describe("BaseAgent.run — dry run", () => {
  it("returns a preview and never queries endpoints, synthesizes, or submits attribution", async () => {
    const searchDirectory = vi.fn().mockResolvedValue([fakeEndpoint()]);
    const queryEndpoint = vi.fn();
    const synthesize = vi.fn();
    const submitAttribution = vi.fn();

    const agent = new TestAgent(config, {
      wallet: fakeWallet(),
      searchDirectory,
      queryEndpoint,
      synthesize,
      submitAttribution,
      checkEndpointIntegrity: passingIntegrityCheck(),
      recordIntegrityEvent: vi.fn().mockResolvedValue(null),
      getApprovedExternalSources: vi.fn().mockResolvedValue([]),
      queryExternalSource: vi.fn(),
    });

    const result = await agent.run({
      agent_type: "trade_intelligence",
      parameters: { commodity: "tuna" },
      user_wallet: "USERWALLET",
      output_language: "en",
      dry_run: true,
    });

    expect(result.dry_run).toBe(true);
    expect(result.preview?.endpoints_to_query).toHaveLength(1);
    expect(result.preview?.estimated_cost_usdc).toBeCloseTo(0.5);
    expect(result.total_cost_usdc).toBe(0);
    expect(queryEndpoint).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
    expect(submitAttribution).not.toHaveBeenCalled();
  });
});

describe("BaseAgent.run — sovereignty enforcement (R6)", () => {
  it("refuses an endpoint flagged indigenous_data_flag=true with no permitted_use_cases", async () => {
    const searchDirectory = vi.fn().mockResolvedValue([fakeEndpoint({ indigenous_data_flag: true, permitted_use_cases: [] })]);

    const agent = new TestAgent(config, {
      wallet: fakeWallet(),
      searchDirectory,
      queryEndpoint: vi.fn(),
      synthesize: vi.fn(),
      submitAttribution: vi.fn(),
    });

    await expect(
      agent.run({
        agent_type: "trade_intelligence",
        parameters: { commodity: "tuna" },
        user_wallet: "USERWALLET",
        output_language: "en",
        dry_run: true,
      }),
    ).rejects.toThrow(SovereigntyBlockedError);
  });

  it("throws InsufficientDataError when a required category has zero results", async () => {
    const searchDirectory = vi.fn().mockResolvedValue([]);

    const agent = new TestAgent(config, {
      wallet: fakeWallet(),
      searchDirectory,
      queryEndpoint: vi.fn(),
      synthesize: vi.fn(),
      submitAttribution: vi.fn(),
    });

    await expect(
      agent.run({
        agent_type: "trade_intelligence",
        parameters: { commodity: "tuna" },
        user_wallet: "USERWALLET",
        output_language: "en",
        dry_run: true,
      }),
    ).rejects.toThrow(InsufficientDataError);
  });
});

describe("BaseAgent.run — live run", () => {
  function successfulResult(): PDCQueryResult {
    return {
      endpoint_id: "end-1",
      data: { total_records: 3 },
      algo_tx_id: "TX123",
      amount_usdc: 0.5,
      provenance_hash: "hash123",
      source_category: "trade",
      queried_at: new Date().toISOString(),
    };
  }

  it("submits attribution with the settled tx id after a successful query and synthesis", async () => {
    const searchDirectory = vi.fn().mockResolvedValue([fakeEndpoint()]);
    const queryEndpoint = vi.fn().mockResolvedValue(successfulResult());
    const synthesize = vi.fn().mockResolvedValue({ raw_text: '{"summary":"ok"}', structured_data: { summary: "ok" } });
    const submitAttribution = vi.fn().mockResolvedValue({ success: true });

    const agent = new TestAgent(config, {
      wallet: fakeWallet(),
      searchDirectory,
      queryEndpoint,
      synthesize,
      submitAttribution,
      checkEndpointIntegrity: passingIntegrityCheck(),
      recordIntegrityEvent: vi.fn().mockResolvedValue(null),
      getApprovedExternalSources: vi.fn().mockResolvedValue([]),
      queryExternalSource: vi.fn(),
    });

    const result = await agent.run({
      agent_type: "trade_intelligence",
      parameters: { commodity: "tuna" },
      user_wallet: "USERWALLET",
      output_language: "en",
      dry_run: false,
    });

    expect(result.dry_run).toBe(false);
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.algo_tx_id).toBe("TX123");
    expect(result.total_cost_usdc).toBeCloseTo(0.5);
    expect(result.synthesis).toBe('{"summary":"ok"}');
    expect(submitAttribution).toHaveBeenCalledTimes(1);
    expect(submitAttribution).toHaveBeenCalledWith(expect.objectContaining({ endpointTxIds: ["TX123"], originatingUserWallet: "USERWALLET" }));
  });

  it("still submits attribution when synthesis fails, and reports a data_warning instead of throwing", async () => {
    const searchDirectory = vi.fn().mockResolvedValue([fakeEndpoint()]);
    const queryEndpoint = vi.fn().mockResolvedValue(successfulResult());
    const synthesize = vi.fn().mockRejectedValue(new Error("anthropic API down"));
    const submitAttribution = vi.fn().mockResolvedValue({ success: true });

    const agent = new TestAgent(config, {
      wallet: fakeWallet(),
      searchDirectory,
      queryEndpoint,
      synthesize,
      submitAttribution,
      checkEndpointIntegrity: passingIntegrityCheck(),
      recordIntegrityEvent: vi.fn().mockResolvedValue(null),
      getApprovedExternalSources: vi.fn().mockResolvedValue([]),
      queryExternalSource: vi.fn(),
    });

    const result = await agent.run({
      agent_type: "trade_intelligence",
      parameters: { commodity: "tuna" },
      user_wallet: "USERWALLET",
      output_language: "en",
      dry_run: false,
    });

    expect(result.synthesis).toBeUndefined();
    expect(result.data_warning).toContain("anthropic API down");
    expect(result.citations).toHaveLength(1);
    expect(submitAttribution).toHaveBeenCalledTimes(1);
  });

  it("throws when every endpoint query fails, never reaching synthesis or attribution", async () => {
    const searchDirectory = vi.fn().mockResolvedValue([fakeEndpoint()]);
    const queryEndpoint = vi.fn().mockRejectedValue(new Error("HTTP 402"));
    const synthesize = vi.fn();
    const submitAttribution = vi.fn();

    const agent = new TestAgent(config, {
      wallet: fakeWallet(),
      searchDirectory,
      queryEndpoint,
      synthesize,
      submitAttribution,
      checkEndpointIntegrity: passingIntegrityCheck(),
      recordIntegrityEvent: vi.fn().mockResolvedValue(null),
      getApprovedExternalSources: vi.fn().mockResolvedValue([]),
      queryExternalSource: vi.fn(),
    });

    await expect(
      agent.run({
        agent_type: "trade_intelligence",
        parameters: { commodity: "tuna" },
        user_wallet: "USERWALLET",
        output_language: "en",
        dry_run: false,
      }),
    ).rejects.toThrow("no data available to synthesise");

    expect(synthesize).not.toHaveBeenCalled();
    expect(submitAttribution).not.toHaveBeenCalled();
  });
});
