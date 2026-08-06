import { describe, expect, it, vi } from "vitest";
import { runQueryCycle } from "../src/agent.js";
import type { Logger } from "../src/logger.js";

function fakeLogger(): Logger & { calls: Array<{ level: string; message: string }> } {
  const calls: Array<{ level: string; message: string }> = [];
  return {
    calls,
    info: (message: string) => calls.push({ level: "info", message }),
    warn: (message: string) => calls.push({ level: "warn", message }),
    error: (message: string) => calls.push({ level: "error", message }),
  };
}

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

describe("runQueryCycle — dry run", () => {
  it("never constructs a payment client when AGENT_WALLET_KEY is unset", async () => {
    const createPayingFetch = vi.fn();
    const logger = fakeLogger();

    const result = await runQueryCycle({
      directoryUrl: "https://directory.example",
      category: "fisheries",
      agentWalletKey: undefined,
      network: "mainnet",
      logger,
      createPayingFetch,
    });

    expect(createPayingFetch).not.toHaveBeenCalled();
    expect(result.dry_run).toBe(true);
    expect(result.total_usdc_spent).toBe(0);
    expect(logger.calls.some((c) => c.message === "agent_cycle_dry_run")).toBe(true);
  });
});

describe("runQueryCycle — live (mocked payingFetch)", () => {
  it("logs a successful cycle: directory query finds an endpoint, endpoint query succeeds", async () => {
    const logger = fakeLogger();
    const payingFetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { results: [{ endpoint: { endpointUrl: "https://pilot.example", isActive: true } }] },
          { headers: {} },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ amount_paid_usdc: 0.01, paid_tier: "summary" }));

    const result = await runQueryCycle({
      directoryUrl: "https://directory.example",
      category: "fisheries",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(result.dry_run).toBe(false);
    expect(result.error).toBeNull();
    expect(result.directory_query.success).toBe(true);
    expect(result.directory_query.results_count).toBe(1);
    expect(result.endpoint_query.success).toBe(true);
    expect(result.endpoint_query.endpoint_url).toBe("https://pilot.example");
    expect(result.total_usdc_spent).toBeCloseTo(0.02);
    expect(logger.calls.some((c) => c.message === "agent_directory_query_succeeded")).toBe(true);
    expect(logger.calls.some((c) => c.message === "agent_endpoint_query_succeeded")).toBe(true);
  });

  it("logs an error and stops after a failed directory query, without throwing", async () => {
    const logger = fakeLogger();
    const payingFetch = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "payment_required" }, { status: 402 }));

    const result = await runQueryCycle({
      directoryUrl: "https://directory.example",
      category: "fisheries",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(result.error).toContain("402");
    expect(result.directory_query.success).toBe(false);
    expect(result.endpoint_query.success).toBe(false);
    expect(payingFetch).toHaveBeenCalledTimes(1); // never attempted the endpoint query
    expect(logger.calls.some((c) => c.level === "error" && c.message === "agent_directory_query_failed")).toBe(true);
  });

  it("does not throw on an invalid (non-JSON) directory response", async () => {
    const logger = fakeLogger();
    const payingFetch = vi.fn().mockResolvedValueOnce(new Response("not json", { status: 200 }));

    await expect(
      runQueryCycle({
        directoryUrl: "https://directory.example",
        category: "fisheries",
        agentWalletKey: "fake-key",
        network: "mainnet",
        logger,
        createPayingFetch: () => payingFetch as unknown as typeof fetch,
      }),
    ).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("records a cycle error when no active endpoint is found, without throwing", async () => {
    const logger = fakeLogger();
    const payingFetch = vi.fn().mockResolvedValueOnce(jsonResponse({ results: [] }));

    const result = await runQueryCycle({
      directoryUrl: "https://directory.example",
      category: "fisheries",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(result.directory_query.success).toBe(true);
    expect(result.endpoint_query.success).toBe(false);
    expect(result.error).toContain("No active fisheries endpoint");
  });
});
