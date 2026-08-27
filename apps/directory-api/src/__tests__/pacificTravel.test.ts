import { Hono } from "hono";
import nacl from "tweetnacl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pacificTravelRoute } from "../routes/intelligence/pacific-travel.js";
import { generatePacificTravelBrief, AllTourismSubEndpointsFailedError } from "../services/pacificTourismService.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { getManualPaymentAddress } from "@pdc/x402-adapter";
import { createFakeSupabase } from "./testUtils.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

/** Real Ed25519 keypair in the exact @pdc/x402-adapter AGENT_WALLET_KEY
 * format — same pattern as pacificBrief.test.ts's makeAgentWalletKey. */
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

  app.route("/", pacificTravelRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /intelligence/pacific-travel — route validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 when destination is missing", async () => {
    const app = buildTestApp();
    const res = await app.request("/intelligence/pacific-travel");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("returns 400 for an invalid destination", async () => {
    const app = buildTestApp();
    const res = await app.request("/intelligence/pacific-travel?destination=US");
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid travel_window", async () => {
    const app = buildTestApp();
    const res = await app.request("/intelligence/pacific-travel?destination=WS&travel_window=next_year");
    expect(res.status).toBe(400);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not configured", async () => {
    const app = buildTestApp({ ANTHROPIC_API_KEY: undefined });
    const res = await app.request("/intelligence/pacific-travel?destination=WS");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("service_unavailable");
  });

  it("returns 503 when AGENT_WALLET_KEY is not configured", async () => {
    const app = buildTestApp({ AGENT_WALLET_KEY: undefined });
    const res = await app.request("/intelligence/pacific-travel?destination=WS");
    expect(res.status).toBe(503);
  });
});

describe("generatePacificTravelBrief — service (dependency-injected payingFetch/synthesize)", () => {
  const { keyBase64, address } = makeAgentWalletKey();

  const statsRow = {
    country_code: "WS",
    country_name: "Samoa",
    year: 2023,
    international_arrivals: 164000,
    tourism_receipts_usd_millions: 180.5,
    avg_spend_per_visitor_usd: 1100,
    avg_length_stay_days: 8.5,
    peak_months: ["December", "January"],
    low_months: ["March"],
    source: "World Bank / Samoa Tourism Authority",
    data_quality: "verified",
  };

  function baseParams(overrides: Partial<Parameters<typeof generatePacificTravelBrief>[0]> = {}, statsData: unknown[] = [statsRow]) {
    const supabase = createFakeSupabase({
      agents: { data: [{ id: "agent-1", operational_wallet: address }] },
      pacific_tourism_stats: { data: statsData },
    });
    return {
      destination: "WS",
      travelWindow: "next_90_days",
      supabase,
      agentWalletKey: keyBase64,
      network: "testnet" as const,
      pilotEndpointUrl: "https://pilot.example",
      publicUrl: "https://directory.example",
      anthropicApiKey: "test-key",
      claudeModel: "claude-haiku-4-5",
      ...overrides,
    };
  }

  const eventsPayload = { results: [{ name: "Teuila Tourism Festival", start_date: "2026-09-01", end_date: "2026-09-05", tourism_impact: "very_high" }], count: 1 };
  const fxPayload = { base: "USD", source: "currency-api", rates: { WST: 2.72 } };
  const fisheriesPayload = { schema_version: "pdp-1.0", paid_tier: "summary", data_warning: "SYNTHETIC DATA: demo only.", data: { total_records: 18 } };
  const weatherPayload = {
    country_code: "WS",
    country_name: "Samoa",
    current: { temperature_c: 25.8, humidity_percent: 78, precipitation_mm: 0, wind_speed_kmh: 4.3, conditions: "Partly cloudy", tourism_rating: "Excellent" },
    forecast_7_day: [{ date: "2026-08-27", temp_max_c: 26.8, temp_min_c: 25.3, precipitation_mm: 0.2, conditions: "Drizzle", tourism_rating: "Excellent" }],
    week_summary: "Excellent conditions — 27°C average, mostly dry",
    queried_at: "2026-08-27T00:00:00.000Z",
    source: "open-meteo",
  };

  it("returns a brief with all 4 paid sub-endpoints queried, tourism stats read, and a valid synthesis", async () => {
    const payingFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(eventsPayload))
      .mockResolvedValueOnce(jsonResponse(fxPayload))
      .mockResolvedValueOnce(jsonResponse(fisheriesPayload))
      .mockResolvedValueOnce(jsonResponse(weatherPayload));

    const synthesizeFn = vi.fn().mockResolvedValue({
      raw_text: "…",
      structured_data: {
        executive_summary: "Strong festival season with excellent weather and stable FX conditions.",
        seasonal_context: "Synthetic demo marine data shows stable conditions.",
        booking_advice: "Book at least 2 months ahead for the Teuila Festival.",
        confidence: "high",
      },
    });

    const brief = await generatePacificTravelBrief(baseParams({ createPayingFetch: () => payingFetch as unknown as typeof fetch, synthesizeFn }));

    expect(payingFetch).toHaveBeenCalledTimes(4);
    expect(payingFetch).toHaveBeenNthCalledWith(1, "https://directory.example/pacific/events?country=WS&days_ahead=90");
    expect(payingFetch).toHaveBeenNthCalledWith(2, "https://directory.example/finance/fx");
    expect(payingFetch).toHaveBeenNthCalledWith(3, "https://pilot.example/summary");
    expect(payingFetch).toHaveBeenNthCalledWith(4, "https://directory.example/pacific/weather?country=WS");
    expect(brief.payments).toHaveLength(4);
    expect(brief.data_sources.map((d) => d.category)).toEqual(["events", "finance", "fisheries", "weather", "tourism_stats"]);
    expect(brief.total_sub_payments_usdc).toBeCloseTo(0.015);
    expect(brief.executive_summary).toBe("Strong festival season with excellent weather and stable FX conditions.");
    expect(brief.confidence).toBe("high");
    expect(brief.upcoming_events).toEqual([{ name: "Teuila Tourism Festival", dates: "2026-09-01 to 2026-09-05", impact: "very_high" }]);
    expect(brief.exchange_rates?.key_rates).toEqual({ WST: 2.72 });

    expect(brief.weather).toEqual({
      current_conditions: "25.8°C, Partly cloudy",
      week_summary: "Excellent conditions — 27°C average, mostly dry",
      tourism_rating: "Excellent",
      forecast_days: 1,
    });

    expect(brief.tourism_stats).toEqual(statsRow);

    // Session 34 — data_warning now scoped explicitly to fisheries, naming
    // which real sources succeeded alongside it, rather than a blanket
    // brief-wide caveat.
    expect(brief.data_warning).toContain("Only the fisheries/marine component of this brief is demonstration data");
    expect(brief.data_warning).toContain("SYNTHETIC DATA");
    expect(brief.data_warning).toContain("events, exchange rates, weather, tourism statistics");
  });

  it("throws AllTourismSubEndpointsFailedError when every paid sub-endpoint fails", async () => {
    const payingFetch = vi.fn().mockResolvedValue(jsonResponse({ error: "payment_required" }, 402));

    await expect(
      generatePacificTravelBrief(baseParams({ createPayingFetch: () => payingFetch as unknown as typeof fetch })),
    ).rejects.toThrow(AllTourismSubEndpointsFailedError);
  });

  it("degrades gracefully when one of the four paid sub-endpoints fails", async () => {
    const payingFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 500))
      .mockResolvedValueOnce(jsonResponse(fxPayload))
      .mockResolvedValueOnce(jsonResponse(fisheriesPayload))
      .mockResolvedValueOnce(jsonResponse(weatherPayload));

    const synthesizeFn = vi.fn().mockResolvedValue({
      raw_text: "…",
      structured_data: { executive_summary: "Partial data available.", seasonal_context: "Stable synthetic conditions.", booking_advice: "No events data this run.", confidence: "medium" },
    });

    const brief = await generatePacificTravelBrief(baseParams({ createPayingFetch: () => payingFetch as unknown as typeof fetch, synthesizeFn }));

    expect(brief.payments).toHaveLength(3);
    expect(brief.data_sources.map((d) => d.category)).toEqual(["finance", "fisheries", "weather", "tourism_stats"]);
    expect(brief.upcoming_events).toEqual([]);
  });

  it("sets data_warning to null and tourism_stats to null when fisheries and stats aren't part of the run", async () => {
    const payingFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(eventsPayload))
      .mockResolvedValueOnce(jsonResponse(fxPayload))
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 500)) // fisheries fails
      .mockResolvedValueOnce(jsonResponse(weatherPayload));

    const synthesizeFn = vi.fn().mockResolvedValue({
      raw_text: "…",
      structured_data: { executive_summary: "No marine data this run.", seasonal_context: "Marine data unavailable.", booking_advice: "See events for timing.", confidence: "medium" },
    });

    const brief = await generatePacificTravelBrief(baseParams({ createPayingFetch: () => payingFetch as unknown as typeof fetch, synthesizeFn }, []));

    expect(brief.data_warning).toBeNull();
    expect(brief.tourism_stats).toBeNull();
    expect(brief.data_sources.map((d) => d.category)).toEqual(["events", "finance", "weather"]);
  });

  it("falls back to a structured low-confidence brief when synthesis returns invalid JSON", async () => {
    const payingFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(eventsPayload))
      .mockResolvedValueOnce(jsonResponse(fxPayload))
      .mockResolvedValueOnce(jsonResponse(fisheriesPayload))
      .mockResolvedValueOnce(jsonResponse(weatherPayload));

    const synthesizeFn = vi.fn().mockResolvedValue({ raw_text: "not json at all", structured_data: null });

    const brief = await generatePacificTravelBrief(baseParams({ createPayingFetch: () => payingFetch as unknown as typeof fetch, synthesizeFn }));

    expect(brief.confidence).toBe("low");
    expect(brief.executive_summary).toContain("could not produce a structured brief");
    expect(brief.payments).toHaveLength(4);
    // Structural fields still populate correctly even when synthesis fails.
    expect(brief.upcoming_events).toHaveLength(1);
    expect(brief.weather).not.toBeNull();
  });

  it("falls back to a structured low-confidence brief when the synthesis call throws", async () => {
    const payingFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(eventsPayload))
      .mockResolvedValueOnce(jsonResponse(fxPayload))
      .mockResolvedValueOnce(jsonResponse(fisheriesPayload))
      .mockResolvedValueOnce(jsonResponse(weatherPayload));

    const synthesizeFn = vi.fn().mockRejectedValue(new Error("Anthropic API error: 500"));

    const brief = await generatePacificTravelBrief(baseParams({ createPayingFetch: () => payingFetch as unknown as typeof fetch, synthesizeFn }));

    expect(brief.confidence).toBe("low");
  });
});
