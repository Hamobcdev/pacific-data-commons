import { describe, expect, it, vi } from "vitest";
import {
  runQueryCycle,
  runWalletBalanceCanaryCheck,
  runFxCanaryCheck,
  runOrchestratorCanaryCheck,
  runEventsCanaryCheck,
  runTourismCanaryCheck,
  runWeatherCanaryCheck,
  WALLET_BALANCE_CANARY_ADDRESS,
} from "../src/agent.js";
import type { Logger } from "../src/logger.js";

function fakeLogger(): Logger & { calls: Array<{ level: string; message: string; fields?: Record<string, unknown> }> } {
  const calls: Array<{ level: string; message: string; fields?: Record<string, unknown> }> = [];
  return {
    calls,
    info: (message: string, fields?: Record<string, unknown>) => calls.push({ level: "info", message, fields }),
    warn: (message: string, fields?: Record<string, unknown>) => calls.push({ level: "warn", message, fields }),
    error: (message: string, fields?: Record<string, unknown>) => calls.push({ level: "error", message, fields }),
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

describe("runWalletBalanceCanaryCheck — dry run", () => {
  it("never constructs a payment client when AGENT_WALLET_KEY is unset", async () => {
    const createPayingFetch = vi.fn();
    const logger = fakeLogger();

    const result = await runWalletBalanceCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: undefined,
      network: "mainnet",
      logger,
      createPayingFetch,
    });

    expect(createPayingFetch).not.toHaveBeenCalled();
    expect(result.dry_run).toBe(true);
    expect(result.address).toBe(WALLET_BALANCE_CANARY_ADDRESS);
    expect(logger.calls.some((c) => c.message === "agent_wallet_balance_canary_dry_run")).toBe(true);
  });
});

describe("runWalletBalanceCanaryCheck — live (mocked payingFetch)", () => {
  it("queries the SBP payTo address and logs a canary-tagged success", async () => {
    const logger = fakeLogger();
    const payingFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({ address: WALLET_BALANCE_CANARY_ADDRESS, exists: true, algo_balance: 12.5, usdc_balance: 100.25 }),
    );

    const result = await runWalletBalanceCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      walletAddress: "AGENTWALLETADDR",
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(payingFetch).toHaveBeenCalledWith(
      `https://directory.example/algorand/wallet-balance?address=${WALLET_BALANCE_CANARY_ADDRESS}`,
    );
    expect(result.dry_run).toBe(false);
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.exists).toBe(true);
    expect(result.algo_balance).toBe(12.5);
    expect(result.usdc_balance).toBe(100.25);
    expect(result.amount_usdc).toBeCloseTo(0.005);
    expect(logger.calls.some((c) => c.message === "agent_wallet_balance_query_succeeded")).toBe(true);
  });

  it("logs an error and returns success:false without throwing on a non-ok response", async () => {
    const logger = fakeLogger();
    const payingFetch = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "payment_required" }, { status: 402 }));

    const result = await runWalletBalanceCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("402");
    expect(result.tx_id).toBeNull();
    expect(logger.calls.some((c) => c.level === "error" && c.message === "agent_wallet_balance_query_failed")).toBe(true);
  });
});

describe("runFxCanaryCheck — dry run", () => {
  it("never constructs a payment client when AGENT_WALLET_KEY is unset", async () => {
    const createPayingFetch = vi.fn();
    const logger = fakeLogger();

    const result = await runFxCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: undefined,
      network: "mainnet",
      logger,
      createPayingFetch,
    });

    expect(createPayingFetch).not.toHaveBeenCalled();
    expect(result.dry_run).toBe(true);
    expect(result.source).toBeNull();
    expect(logger.calls.some((c) => c.message === "agent_fx_canary_dry_run")).toBe(true);
  });
});

describe("runFxCanaryCheck — live (mocked payingFetch)", () => {
  it("queries GET /finance/fx and logs a canary-tagged success", async () => {
    const logger = fakeLogger();
    const payingFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        base: "USD",
        source: "currency-api",
        rates: { WST: 2.72, FJD: 2.19, AUD: 1.4, ALGO: 0.092, USDC: 1.0 },
      }),
    );

    const result = await runFxCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      walletAddress: "AGENTWALLETADDR",
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(payingFetch).toHaveBeenCalledWith("https://directory.example/finance/fx");
    expect(result.dry_run).toBe(false);
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.source).toBe("currency-api");
    expect(result.rates_count).toBe(5);
    expect(result.amount_usdc).toBeCloseTo(0.001);
    expect(logger.calls.some((c) => c.message === "agent_fx_query_succeeded")).toBe(true);
  });

  it("logs an error and returns success:false without throwing on a non-ok response", async () => {
    const logger = fakeLogger();
    const payingFetch = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "payment_required" }, { status: 402 }));

    const result = await runFxCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("402");
    expect(result.tx_id).toBeNull();
    expect(logger.calls.some((c) => c.level === "error" && c.message === "agent_fx_query_failed")).toBe(true);
  });
});

describe("runOrchestratorCanaryCheck — dry run", () => {
  it("never constructs a payment client when AGENT_WALLET_KEY is unset", async () => {
    const createPayingFetch = vi.fn();
    const logger = fakeLogger();

    const result = await runOrchestratorCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: undefined,
      network: "mainnet",
      logger,
      createPayingFetch,
    });

    expect(createPayingFetch).not.toHaveBeenCalled();
    expect(result.dry_run).toBe(true);
    expect(result.sub_payments_count).toBeNull();
    expect(logger.calls.some((c) => c.message === "agent_orchestrator_canary_dry_run")).toBe(true);
  });
});

describe("runOrchestratorCanaryCheck — live (mocked payingFetch)", () => {
  it("queries GET /intelligence/pacific-brief and logs a canary-tagged success", async () => {
    const logger = fakeLogger();
    const payingFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        confidence: "high",
        total_sub_payments_usdc: 0.016,
        payments: [
          { endpoint: "https://pdcpilot-endpoint-production.up.railway.app/summary", category: "fisheries", tx_id: null, amount_usdc: 0.01 },
          { endpoint: "https://directory.example/finance/fx", category: "finance", tx_id: null, amount_usdc: 0.001 },
          { endpoint: "https://directory.example/algorand/wallet-balance", category: "algorand", tx_id: null, amount_usdc: 0.005 },
        ],
      }),
    );

    const result = await runOrchestratorCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      walletAddress: "AGENTWALLETADDR",
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(payingFetch).toHaveBeenCalledWith("https://directory.example/intelligence/pacific-brief?topic=fisheries&country=WS");
    expect(result.dry_run).toBe(false);
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.sub_payments_count).toBe(3);
    expect(result.total_sub_payments_usdc).toBeCloseTo(0.016);
    expect(result.confidence).toBe("high");
    expect(result.amount_usdc).toBeCloseTo(0.05);
    expect(logger.calls.some((c) => c.message === "agent_orchestrator_query_succeeded")).toBe(true);
  });

  it("logs an error and returns success:false without throwing on a non-ok response", async () => {
    const logger = fakeLogger();
    const payingFetch = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "payment_required" }, { status: 402 }));

    const result = await runOrchestratorCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("402");
    expect(result.tx_id).toBeNull();
    expect(logger.calls.some((c) => c.level === "error" && c.message === "agent_orchestrator_query_failed")).toBe(true);
  });
});

describe("runEventsCanaryCheck — dry run", () => {
  it("never constructs a payment client when AGENT_WALLET_KEY is unset", async () => {
    const createPayingFetch = vi.fn();
    const logger = fakeLogger();

    const result = await runEventsCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: undefined,
      network: "mainnet",
      logger,
      createPayingFetch,
    });

    expect(createPayingFetch).not.toHaveBeenCalled();
    expect(result.dry_run).toBe(true);
    expect(result.results_count).toBeNull();
    expect(logger.calls.some((c) => c.message === "agent_events_canary_dry_run")).toBe(true);
  });
});

describe("runEventsCanaryCheck — live (mocked payingFetch)", () => {
  it("queries GET /pacific/events and logs a canary-tagged success", async () => {
    const logger = fakeLogger();
    const payingFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        results: [{ name: "Teuila Tourism Festival", category: "festival", country_code: "WS" }],
        count: 1,
      }),
    );

    const result = await runEventsCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      walletAddress: "AGENTWALLETADDR",
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(payingFetch).toHaveBeenCalledWith("https://directory.example/pacific/events?country=WS&days_ahead=90");
    expect(result.dry_run).toBe(false);
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.results_count).toBe(1);
    expect(result.amount_usdc).toBeCloseTo(0.002);
    expect(logger.calls.some((c) => c.message === "agent_events_query_succeeded")).toBe(true);
  });

  it("logs an error and returns success:false without throwing on a non-ok response", async () => {
    const logger = fakeLogger();
    const payingFetch = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "payment_required" }, { status: 402 }));

    const result = await runEventsCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("402");
    expect(result.tx_id).toBeNull();
    expect(logger.calls.some((c) => c.level === "error" && c.message === "agent_events_query_failed")).toBe(true);
  });
});

describe("runTourismCanaryCheck — dry run", () => {
  it("never constructs a payment client when AGENT_WALLET_KEY is unset", async () => {
    const createPayingFetch = vi.fn();
    const logger = fakeLogger();

    const result = await runTourismCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: undefined,
      network: "mainnet",
      logger,
      createPayingFetch,
    });

    expect(createPayingFetch).not.toHaveBeenCalled();
    expect(result.dry_run).toBe(true);
    expect(result.sub_payments_count).toBeNull();
    expect(logger.calls.some((c) => c.message === "agent_tourism_canary_dry_run")).toBe(true);
  });
});

describe("runTourismCanaryCheck — live (mocked payingFetch)", () => {
  it("queries GET /intelligence/pacific-travel and logs a canary-tagged success", async () => {
    const logger = fakeLogger();
    const payingFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        confidence: "high",
        total_sub_payments_usdc: 0.013,
        payments: [
          { endpoint: "https://directory.example/pacific/events", category: "events", tx_id: null, amount_usdc: 0.002 },
          { endpoint: "https://directory.example/finance/fx", category: "finance", tx_id: null, amount_usdc: 0.001 },
          { endpoint: "https://pdcpilot-endpoint-production.up.railway.app/summary", category: "fisheries", tx_id: null, amount_usdc: 0.01 },
        ],
      }),
    );

    const result = await runTourismCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      walletAddress: "AGENTWALLETADDR",
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(payingFetch).toHaveBeenCalledWith("https://directory.example/intelligence/pacific-travel?destination=WS");
    expect(result.dry_run).toBe(false);
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.sub_payments_count).toBe(3);
    expect(result.total_sub_payments_usdc).toBeCloseTo(0.013);
    expect(result.confidence).toBe("high");
    expect(result.amount_usdc).toBeCloseTo(0.1);
    expect(logger.calls.some((c) => c.message === "agent_tourism_query_succeeded")).toBe(true);
  });

  it("logs an error and returns success:false without throwing on a non-ok response", async () => {
    const logger = fakeLogger();
    const payingFetch = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "payment_required" }, { status: 402 }));

    const result = await runTourismCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("402");
    expect(result.tx_id).toBeNull();
    expect(logger.calls.some((c) => c.level === "error" && c.message === "agent_tourism_query_failed")).toBe(true);
  });

  it("captures the full response body and payment headers on a rejected settlement, not just the status code", async () => {
    const logger = fakeLogger();
    const rejectionBody = { error: "invalid_payment", reason: "amount mismatch" };
    const payingFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse(rejectionBody, {
        status: 402,
        headers: {
          "PAYMENT-RESPONSE": "eyJzdWNjZXNzIjpmYWxzZX0=",
          "PAYMENT-REQUIRED": "eyJ4NDAyVmVyc2lvbiI6Mn0=",
        },
      }),
    );

    const result = await runTourismCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      walletAddress: "AGENTWALLETADDR",
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    // The thrown error (and therefore result.error) must carry the actual
    // rejection body, not just "HTTP 402".
    expect(result.error).toContain("invalid_payment");
    expect(result.error).toContain("amount mismatch");

    const rejectedLog = logger.calls.find((c) => c.message === "agent_tourism_payment_rejected");
    expect(rejectedLog).toBeDefined();
    expect(rejectedLog?.fields?.status).toBe(402);
    expect(rejectedLog?.fields?.body).toEqual(rejectionBody);
    expect(rejectedLog?.fields?.payment_response_header).toBe("eyJzdWNjZXNzIjpmYWxzZX0=");
    expect(rejectedLog?.fields?.payment_required_header).toBe("eyJ4NDAyVmVyc2lvbiI6Mn0=");
  });
});

describe("runWeatherCanaryCheck — dry run", () => {
  it("never constructs a payment client when AGENT_WALLET_KEY is unset", async () => {
    const createPayingFetch = vi.fn();
    const logger = fakeLogger();

    const result = await runWeatherCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: undefined,
      network: "mainnet",
      logger,
      createPayingFetch,
    });

    expect(createPayingFetch).not.toHaveBeenCalled();
    expect(result.dry_run).toBe(true);
    expect(result.temperature_c).toBeNull();
    expect(logger.calls.some((c) => c.message === "agent_weather_canary_dry_run")).toBe(true);
  });
});

describe("runWeatherCanaryCheck — live (mocked payingFetch)", () => {
  it("queries GET /pacific/weather and logs a canary-tagged success", async () => {
    const logger = fakeLogger();
    const payingFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        country_code: "WS",
        current: { temperature_c: 25.8, tourism_rating: "Excellent" },
      }),
    );

    const result = await runWeatherCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      walletAddress: "AGENTWALLETADDR",
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(payingFetch).toHaveBeenCalledWith("https://directory.example/pacific/weather?country=WS");
    expect(result.dry_run).toBe(false);
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.temperature_c).toBe(25.8);
    expect(result.tourism_rating).toBe("Excellent");
    expect(result.amount_usdc).toBeCloseTo(0.002);
    expect(logger.calls.some((c) => c.message === "agent_weather_query_succeeded")).toBe(true);
  });

  it("logs an error and returns success:false without throwing on a non-ok response", async () => {
    const logger = fakeLogger();
    const payingFetch = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "payment_required" }, { status: 402 }));

    const result = await runWeatherCanaryCheck({
      directoryUrl: "https://directory.example",
      agentWalletKey: "fake-key",
      network: "mainnet",
      logger,
      createPayingFetch: () => payingFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("402");
    expect(result.tx_id).toBeNull();
    expect(logger.calls.some((c) => c.level === "error" && c.message === "agent_weather_query_failed")).toBe(true);
  });
});
