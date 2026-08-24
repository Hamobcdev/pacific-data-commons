import { Hono } from "hono";
import nacl from "tweetnacl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pacificBriefRoute } from "../routes/intelligence/pacific-brief.js";
import { generatePacificBrief, AllSubEndpointsFailedError } from "../services/pacificIntelligenceService.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { getManualPaymentAddress } from "@pdc/x402-adapter";
import { createFakeSupabase } from "./testUtils.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

/** Real Ed25519 keypair in the exact @pdc/x402-adapter AGENT_WALLET_KEY
 * format (base64 64-byte secret key) — same pattern as attribution.test.ts's
 * makeSignedPayload, so getManualPaymentAddress derives a real, matching
 * Algorand address rather than a fabricated string. */
function makeAgentWalletKey(): { keyBase64: string; address: string } {
  const keyPair = nacl.sign.keyPair();
  const keyBase64 = Buffer.from(keyPair.secretKey).toString("base64");
  return { keyBase64, address: getManualPaymentAddress(keyBase64) };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function buildTestApp(envOverrides: Partial<Env> = {}) {
  const app = new Hono<AppBindings>();
  const env = { ANTHROPIC_API_KEY: "test-key", AGENT_WALLET_KEY: "test-wallet-key", ...envOverrides } as Env;
  const supabase = createFakeSupabase({});

  app.use("*", async (c, next) => {
    c.set("env", env);
    c.set("supabase", supabase);
    await next();
  });

  app.route("/", pacificBriefRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /intelligence/pacific-brief — route validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 for an invalid topic", async () => {
    const app = buildTestApp();
    const res = await app.request("/intelligence/pacific-brief?topic=astrology");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("returns 400 for an invalid country", async () => {
    const app = buildTestApp();
    const res = await app.request("/intelligence/pacific-brief?topic=fisheries&country=US");
    expect(res.status).toBe(400);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not configured", async () => {
    const app = buildTestApp({ ANTHROPIC_API_KEY: undefined });
    const res = await app.request("/intelligence/pacific-brief");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("service_unavailable");
  });

  it("returns 503 when AGENT_WALLET_KEY is not configured", async () => {
    const app = buildTestApp({ AGENT_WALLET_KEY: undefined });
    const res = await app.request("/intelligence/pacific-brief");
    expect(res.status).toBe(503);
  });
});

describe("generatePacificBrief — service (dependency-injected payingFetch/synthesize)", () => {
  const { keyBase64, address } = makeAgentWalletKey();

  function baseParams(overrides: Partial<Parameters<typeof generatePacificBrief>[0]> = {}) {
    const supabase = createFakeSupabase({
      agents: { data: [{ id: "agent-1", operational_wallet: address }] },
    });
    return {
      topic: "fisheries",
      country: "WS",
      supabase,
      agentWalletKey: keyBase64,
      network: "testnet" as const,
      pilotEndpointUrl: "https://pilot.example",
      publicUrl: "https://directory.example",
      avmAddress: "A".repeat(58),
      anthropicApiKey: "test-key",
      claudeModel: "claude-haiku-4-5",
      ...overrides,
    };
  }

  it("returns a brief with all 3 real sub-endpoints queried and a valid synthesis", async () => {
    const payingFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ schema_version: "pdp-1.0", paid_tier: "summary", data_warning: "SYNTHETIC DATA: demo only.", data: { total_records: 18 } }))
      .mockResolvedValueOnce(jsonResponse({ base: "USD", source: "currency-api", rates: { WST: 2.72 } }))
      .mockResolvedValueOnce(jsonResponse({ address: "A".repeat(58), exists: true, algo_balance: 12.5, usdc_balance: 100 }));

    const synthesizeFn = vi.fn().mockResolvedValue({
      raw_text: "…",
      structured_data: {
        executive_summary: "Stable conditions across all sources this run.",
        key_findings: ["Fisheries stock healthy (synthetic demo)", "FX stable", "Wallet funded"],
        limitations: "Fisheries data is synthetic demo data.",
        confidence: "high",
      },
    });

    const brief = await generatePacificBrief(baseParams({ createPayingFetch: () => payingFetch as unknown as typeof fetch, synthesizeFn }));

    expect(payingFetch).toHaveBeenCalledTimes(3);
    expect(payingFetch).toHaveBeenNthCalledWith(1, "https://pilot.example/summary");
    expect(payingFetch).toHaveBeenNthCalledWith(2, "https://directory.example/finance/fx");
    expect(payingFetch).toHaveBeenNthCalledWith(3, `https://directory.example/algorand/wallet-balance?address=${"A".repeat(58)}`);
    expect(brief.payments).toHaveLength(3);
    expect(brief.data_sources.map((d) => d.category)).toEqual(["fisheries", "finance", "algorand"]);
    expect(brief.total_sub_payments_usdc).toBeCloseTo(0.016);
    expect(brief.executive_summary).toBe("Stable conditions across all sources this run.");
    expect(brief.confidence).toBe("high");
    expect(brief.data_warning).toContain("SYNTHETIC DATA");
  });

  it("throws AllSubEndpointsFailedError when every sub-endpoint fails", async () => {
    const payingFetch = vi.fn().mockResolvedValue(jsonResponse({ error: "payment_required" }, 402));

    await expect(
      generatePacificBrief(baseParams({ createPayingFetch: () => payingFetch as unknown as typeof fetch })),
    ).rejects.toThrow(AllSubEndpointsFailedError);
  });

  it("degrades gracefully when one of the three sub-endpoints fails", async () => {
    const payingFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 500))
      .mockResolvedValueOnce(jsonResponse({ base: "USD", source: "currency-api", rates: { WST: 2.72 } }))
      .mockResolvedValueOnce(jsonResponse({ address: "A".repeat(58), exists: true, algo_balance: 12.5, usdc_balance: 100 }));

    const synthesizeFn = vi.fn().mockResolvedValue({
      raw_text: "…",
      structured_data: { executive_summary: "Partial data available.", key_findings: ["FX stable"], limitations: "Fisheries source unavailable this run.", confidence: "medium" },
    });

    const brief = await generatePacificBrief(baseParams({ createPayingFetch: () => payingFetch as unknown as typeof fetch, synthesizeFn }));

    expect(brief.payments).toHaveLength(2);
    expect(brief.data_sources.map((d) => d.category)).toEqual(["finance", "algorand"]);
  });

  it("falls back to a structured low-confidence brief when synthesis returns invalid JSON", async () => {
    const payingFetch = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ base: "USD", source: "currency-api", rates: { WST: 2.72 } }));

    const synthesizeFn = vi.fn().mockResolvedValue({ raw_text: "not json at all", structured_data: null });

    const brief = await generatePacificBrief(baseParams({ createPayingFetch: () => payingFetch as unknown as typeof fetch, synthesizeFn }));

    expect(brief.confidence).toBe("low");
    expect(brief.executive_summary).toContain("could not produce a structured brief");
    expect(brief.payments).toHaveLength(3);
  });

  it("falls back to a structured low-confidence brief when synthesis is missing required fields", async () => {
    const payingFetch = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ base: "USD", source: "currency-api", rates: { WST: 2.72 } }));

    const synthesizeFn = vi.fn().mockResolvedValue({ raw_text: "{}", structured_data: { confidence: "high" } });

    const brief = await generatePacificBrief(baseParams({ createPayingFetch: () => payingFetch as unknown as typeof fetch, synthesizeFn }));

    expect(brief.confidence).toBe("low");
    expect(brief.key_findings.length).toBeGreaterThan(0);
  });

  it("falls back to a structured low-confidence brief when the synthesis call throws", async () => {
    const payingFetch = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ base: "USD", source: "currency-api", rates: { WST: 2.72 } }));

    const synthesizeFn = vi.fn().mockRejectedValue(new Error("Anthropic API error: 500"));

    const brief = await generatePacificBrief(baseParams({ createPayingFetch: () => payingFetch as unknown as typeof fetch, synthesizeFn }));

    expect(brief.confidence).toBe("low");
  });
});
