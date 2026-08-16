import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AgentType, DataCategory } from "@pdc/shared-types";
import { BaseAgent, type AgentRuntimeConfig } from "../src/agents/base.js";
import type { AgentWallet, DirectoryEndpointResult, PDCQueryResult } from "../src/lib/pdcClient.js";
import type { ApprovedExternalSource } from "../src/lib/externalSourceClient.js";

/**
 * Session 19 / Decision 56 — dedicated coverage for BaseAgent's Step 5b
 * (external source querying), kept separate from base.test.ts for the same
 * reason base.integrity.test.ts is separate: a distinct feature added on
 * top of the pre-existing run() behaviour, not a fifth describe block in
 * an already-large file.
 */
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

function fakeExternalSource(overrides: Partial<ApprovedExternalSource> = {}): ApprovedExternalSource {
  return {
    id: "src-1",
    name: "Global SST Feed",
    endpointUrl: "https://external.example/market",
    priceUsdc: 0.02,
    providerName: "External Org",
    ...overrides,
  };
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

const runInput = {
  agent_type: "trade_intelligence" as const,
  parameters: { commodity: "tuna" },
  user_wallet: "USERWALLET",
  output_language: "en",
  dry_run: false,
};

function passingIntegrityCheck() {
  return vi.fn().mockResolvedValue({ passed: true, status: "no_cert_hash", expectedHash: null, actualHash: null, message: "" });
}

describe("BaseAgent.run — external sources (Decision 56)", () => {
  it("queries an approved external source after PDC and includes it in citations, cost, and attribution", async () => {
    const submitAttribution = vi.fn().mockResolvedValue({ success: true });
    const queryExternalSource = vi.fn().mockResolvedValue({
      sourceId: "src-1",
      sourceName: "Global SST Feed",
      providerName: "External Org",
      data: { sea_surface_temp_c: 28.4 },
      algoTxId: "EXTTX456",
      amountUsdc: 0.02,
    });

    const agent = new TestAgent(config, {
      wallet: fakeWallet(),
      searchDirectory: vi.fn().mockResolvedValue([fakeEndpoint()]),
      queryEndpoint: vi.fn().mockResolvedValue(successfulResult()),
      synthesize: vi.fn().mockResolvedValue({ raw_text: "ok", structured_data: null }),
      submitAttribution,
      checkEndpointIntegrity: passingIntegrityCheck(),
      recordIntegrityEvent: vi.fn().mockResolvedValue(null),
      getApprovedExternalSources: vi.fn().mockResolvedValue([fakeExternalSource()]),
      queryExternalSource,
    });

    const result = await agent.run(runInput);

    expect(queryExternalSource).toHaveBeenCalledTimes(1);
    expect(result.external_citations).toHaveLength(1);
    expect(result.external_citations?.[0]).toMatchObject({ source_id: "src-1", algo_tx_id: "EXTTX456", amount_usdc: 0.02 });
    // PDC (0.5) + external (0.02) — external is additive, never a substitute for PDC cost.
    expect(result.total_cost_usdc).toBeCloseTo(0.52);
    expect(submitAttribution).toHaveBeenCalledWith(expect.objectContaining({ endpointTxIds: ["TX123", "EXTTX456"] }));
  });

  it("degrades gracefully when the external source query fails — PDC citations and synthesis are unaffected", async () => {
    const submitAttribution = vi.fn().mockResolvedValue({ success: true });

    const agent = new TestAgent(config, {
      wallet: fakeWallet(),
      searchDirectory: vi.fn().mockResolvedValue([fakeEndpoint()]),
      queryEndpoint: vi.fn().mockResolvedValue(successfulResult()),
      synthesize: vi.fn().mockResolvedValue({ raw_text: "ok", structured_data: null }),
      submitAttribution,
      checkEndpointIntegrity: passingIntegrityCheck(),
      recordIntegrityEvent: vi.fn().mockResolvedValue(null),
      getApprovedExternalSources: vi.fn().mockResolvedValue([fakeExternalSource()]),
      // Non-fatal failure — externalSourceClient.ts never throws, it returns null.
      queryExternalSource: vi.fn().mockResolvedValue(null),
    });

    const result = await agent.run(runInput);

    expect(result.external_citations).toBeUndefined();
    expect(result.citations).toHaveLength(1);
    expect(result.total_cost_usdc).toBeCloseTo(0.5);
    expect(submitAttribution).toHaveBeenCalledWith(expect.objectContaining({ endpointTxIds: ["TX123"] }));
  });

  it("never queries external sources when no PDC query succeeded (PDC is always primary)", async () => {
    const getApprovedExternalSources = vi.fn().mockResolvedValue([fakeExternalSource()]);

    const agent = new TestAgent(config, {
      wallet: fakeWallet(),
      searchDirectory: vi.fn().mockResolvedValue([fakeEndpoint()]),
      queryEndpoint: vi.fn().mockRejectedValue(new Error("HTTP 402")),
      synthesize: vi.fn(),
      submitAttribution: vi.fn(),
      checkEndpointIntegrity: passingIntegrityCheck(),
      recordIntegrityEvent: vi.fn().mockResolvedValue(null),
      getApprovedExternalSources,
      queryExternalSource: vi.fn(),
    });

    await expect(agent.run(runInput)).rejects.toThrow("no data available to synthesise");
    expect(getApprovedExternalSources).not.toHaveBeenCalled();
  });

  it("omits external_citations entirely when the agent has no approved external sources", async () => {
    const agent = new TestAgent(config, {
      wallet: fakeWallet(),
      searchDirectory: vi.fn().mockResolvedValue([fakeEndpoint()]),
      queryEndpoint: vi.fn().mockResolvedValue(successfulResult()),
      synthesize: vi.fn().mockResolvedValue({ raw_text: "ok", structured_data: null }),
      submitAttribution: vi.fn().mockResolvedValue({ success: true }),
      checkEndpointIntegrity: passingIntegrityCheck(),
      recordIntegrityEvent: vi.fn().mockResolvedValue(null),
      getApprovedExternalSources: vi.fn().mockResolvedValue([]),
      queryExternalSource: vi.fn(),
    });

    const result = await agent.run(runInput);
    expect(result.external_citations).toBeUndefined();
  });
});
