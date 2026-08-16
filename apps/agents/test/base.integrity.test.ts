import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AgentType, DataCategory } from "@pdc/shared-types";
import { BaseAgent, type AgentRuntimeConfig } from "../src/agents/base.js";
import type { AgentWallet, DirectoryEndpointResult, PDCQueryResult } from "../src/lib/pdcClient.js";
import { checkEndpointIntegrity, type IntegrityCheckResult } from "../src/integrity.js";

/**
 * Session 17 (Decision 49) — dedicated coverage for the integrity-check
 * gate wired into BaseAgent.run()'s step 5, kept separate from
 * base.test.ts (pre-existing, general run() behaviour) rather than adding
 * a fifth describe block there.
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

function integrityResult(overrides: Partial<IntegrityCheckResult>): IntegrityCheckResult {
  return { passed: true, status: "no_cert_hash", expectedHash: null, actualHash: null, message: "", ...overrides };
}

describe("BaseAgent.run — integrity check gate (Decision 49)", () => {
  it("blocks payment and skips the endpoint on status=fail, never calling queryEndpoint", async () => {
    const queryEndpoint = vi.fn();
    const checkEndpointIntegrity = vi.fn().mockResolvedValue(
      integrityResult({ passed: false, status: "fail", expectedHash: "abc", actualHash: "xyz", message: "mismatch" }),
    );
    const recordIntegrityEvent = vi.fn().mockResolvedValue(null);

    const agent = new TestAgent(config, {
      wallet: fakeWallet(),
      searchDirectory: vi.fn().mockResolvedValue([fakeEndpoint()]),
      queryEndpoint,
      synthesize: vi.fn(),
      submitAttribution: vi.fn(),
      checkEndpointIntegrity,
      recordIntegrityEvent,
    });

    // Sole required category's only endpoint fails integrity -> zero
    // successful queries -> the pre-existing "no data available" guard
    // fires, matching how a queryEndpoint HTTP failure behaves today.
    await expect(agent.run(runInput)).rejects.toThrow("no data available to synthesise");
    expect(queryEndpoint).not.toHaveBeenCalled();
  });

  it.each([
    ["no_cert_hash", integrityResult({ status: "no_cert_hash" })],
    ["endpoint_unavailable", integrityResult({ status: "endpoint_unavailable", expectedHash: "abc" })],
    ["pass", integrityResult({ status: "pass", expectedHash: "abc", actualHash: "abc" })],
  ] as const)("proceeds to payment on status=%s", async (_label, result) => {
    const queryEndpoint = vi.fn().mockResolvedValue(successfulResult());
    const submitAttribution = vi.fn().mockResolvedValue({ success: true });

    const agent = new TestAgent(config, {
      wallet: fakeWallet(),
      searchDirectory: vi.fn().mockResolvedValue([fakeEndpoint()]),
      queryEndpoint,
      synthesize: vi.fn().mockResolvedValue({ raw_text: "ok", structured_data: null }),
      submitAttribution,
      checkEndpointIntegrity: vi.fn().mockResolvedValue(result),
      recordIntegrityEvent: vi.fn().mockResolvedValue(null),
      getApprovedExternalSources: vi.fn().mockResolvedValue([]),
      queryExternalSource: vi.fn(),
    });

    const output = await agent.run(runInput);
    expect(queryEndpoint).toHaveBeenCalledTimes(1);
    expect(output.citations).toHaveLength(1);
    expect(submitAttribution).toHaveBeenCalledTimes(1);
  });

  it("never blocks the run when recordIntegrityEvent's fire-and-forget promise rejects", async () => {
    const recordIntegrityEvent = vi.fn().mockRejectedValue(new Error("directory-api unreachable"));
    const submitAttribution = vi.fn().mockResolvedValue({ success: true });

    const agent = new TestAgent(config, {
      wallet: fakeWallet(),
      searchDirectory: vi.fn().mockResolvedValue([fakeEndpoint()]),
      queryEndpoint: vi.fn().mockResolvedValue(successfulResult()),
      synthesize: vi.fn().mockResolvedValue({ raw_text: "ok", structured_data: null }),
      submitAttribution,
      checkEndpointIntegrity: vi.fn().mockResolvedValue(integrityResult({ status: "pass", expectedHash: "abc", actualHash: "abc" })),
      recordIntegrityEvent,
      getApprovedExternalSources: vi.fn().mockResolvedValue([]),
      queryExternalSource: vi.fn(),
    });

    const output = await agent.run(runInput);
    expect(output.citations).toHaveLength(1);
    expect(submitAttribution).toHaveBeenCalledTimes(1);
  });

  it("Session 18 (Decision 52): endpoint.pending_recertification=true reaches the real checkEndpointIntegrity and still pays — no mock swapped in", async () => {
    const queryEndpoint = vi.fn().mockResolvedValue(successfulResult());

    const agent = new TestAgent(config, {
      wallet: fakeWallet(),
      searchDirectory: vi.fn().mockResolvedValue([fakeEndpoint({ pending_recertification: true })]),
      queryEndpoint,
      synthesize: vi.fn().mockResolvedValue({ raw_text: "ok", structured_data: null }),
      submitAttribution: vi.fn().mockResolvedValue({ success: true }),
      checkEndpointIntegrity, // the real implementation — proves the field wiring, not a mocked result
      recordIntegrityEvent: vi.fn().mockResolvedValue(null),
      getApprovedExternalSources: vi.fn().mockResolvedValue([]),
      queryExternalSource: vi.fn(),
    });

    const output = await agent.run(runInput);
    expect(queryEndpoint).toHaveBeenCalledTimes(1);
    expect(output.citations).toHaveLength(1);
  });
});
