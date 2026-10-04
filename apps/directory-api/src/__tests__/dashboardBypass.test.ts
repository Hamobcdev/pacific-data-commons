import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdcPaymentGate } from "@pdc/x402-adapter";
import { isDashboardBypassRequest, withDashboardBypass, DASHBOARD_BYPASS_PATHS } from "../middleware/dashboardBypass.js";

// Not a real wallet — same dummy Mainnet-shaped address already used in
// wellKnownX402.test.ts/facilitatorTimeout.test.ts.
const TEST_AVM_ADDRESS = "LN745UCDQNFIBDY6JFW7FNK333MADQZQVQFMCVR3GXXUTB52O2NYPZN3YY";
const TEST_KEY = "test-dashboard-key-value";

// Algorand mainnet's CAIP-2 id (@x402/avm's ALGORAND_MAINNET_CAIP2 constant)
// — the "network" value the real PdcPaymentGate registers with
// x402ResourceServer and therefore the value a facilitator's /supported
// response must echo back for x402ResourceServer.initialize() to accept it.
const ALGORAND_MAINNET_CAIP2 = "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=";

/**
 * Non-bypassed requests in the tests below still reach the real, wrapped
 * PdcPaymentGate — which, on its first request, calls the facilitator's
 * /supported endpoint (x402ResourceServer.initialize(), @x402/core) before
 * it can evaluate payment at all. Unlike facilitatorTimeout.test.ts (which
 * deliberately leaves fetch unmocked/never-resolving to exercise the
 * timeout path), these tests need that call to succeed so the gate reaches
 * its own, real "no payment provided" logic — hence a minimal valid
 * /supported response here instead.
 */
function stubSupportedFacilitatorResponse() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const href = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (href.endsWith("/supported")) {
        return new Response(
          JSON.stringify({
            kinds: [{ x402Version: 2, scheme: "exact", network: ALGORAND_MAINNET_CAIP2 }],
            extensions: [],
            signers: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected facilitator call in test: ${href}`);
    }),
  );
}

describe("isDashboardBypassRequest (pure decision logic)", () => {
  it("returns true when the key matches and the path is one of the 5 bypass paths", () => {
    expect(isDashboardBypassRequest("/finance/fx", TEST_KEY, TEST_KEY)).toBe(true);
  });

  it("returns false when the provided key doesn't match", () => {
    expect(isDashboardBypassRequest("/finance/fx", "wrong-key", TEST_KEY)).toBe(false);
  });

  it("returns false when the header is missing", () => {
    expect(isDashboardBypassRequest("/finance/fx", undefined, TEST_KEY)).toBe(false);
  });

  it("returns false when DASHBOARD_INTERNAL_KEY is unset — fails closed, not open", () => {
    expect(isDashboardBypassRequest("/finance/fx", TEST_KEY, undefined)).toBe(false);
  });

  it("returns false when DASHBOARD_INTERNAL_KEY is an empty string — fails closed", () => {
    expect(isDashboardBypassRequest("/finance/fx", TEST_KEY, "")).toBe(false);
  });

  it("returns false for a correct key on a path NOT in the 5 curated financial endpoints", () => {
    expect(isDashboardBypassRequest("/fisheries/purse-seine", TEST_KEY, TEST_KEY)).toBe(false);
    expect(isDashboardBypassRequest("/search", TEST_KEY, TEST_KEY)).toBe(false);
  });

  it("covers exactly the 5 documented financial endpoints, no more, no fewer", () => {
    expect(DASHBOARD_BYPASS_PATHS).toEqual([
      "/finance/crypto-rates",
      "/finance/crypto-history",
      "/finance/fx",
      "/finance/arbitrage-signals",
      "/finance/remittance-corridors",
    ]);
    for (const path of DASHBOARD_BYPASS_PATHS) {
      expect(isDashboardBypassRequest(path, TEST_KEY, TEST_KEY)).toBe(true);
    }
  });
});

/**
 * Minimal standalone app — same pattern as facilitatorTimeout.test.ts —
 * isolates this test from Supabase/full-env setup, since the only thing
 * under test is withDashboardBypass's wrapping behavior around a real
 * PdcPaymentGate.
 */
function buildTestApp(configuredKey: string | undefined, bypassPath = "/finance/fx") {
  const paymentGate = new PdcPaymentGate({
    payToAddress: TEST_AVM_ADDRESS,
    facilitatorUrl: "https://facilitator.example.invalid",
    network: "mainnet",
  });
  paymentGate.addRoute({
    method: "GET",
    path: bypassPath,
    priceUsdc: 0.01,
    description: "test route",
    resource: `https://api.example.invalid${bypassPath}`,
  });

  const app = new Hono();
  app.use("*", withDashboardBypass(paymentGate.middleware(), configuredKey));
  app.get(bypassPath, (c) => c.json({ ok: true }));
  return app;
}

describe("withDashboardBypass (integration — real PdcPaymentGate, wrapped)", () => {
  beforeEach(() => {
    stubSupportedFacilitatorResponse();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bypasses x402 and returns 200 when the correct key header is sent on a bypass-eligible path", async () => {
    const app = buildTestApp(TEST_KEY);
    const res = await app.request("/finance/fx", { headers: { "X-Internal-Key": TEST_KEY } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("does not bypass and proceeds to the normal 402 x402 flow when the key header is wrong", async () => {
    const app = buildTestApp(TEST_KEY);
    const res = await app.request("/finance/fx", { headers: { "X-Internal-Key": "wrong-key" } });
    expect(res.status).toBe(402);
  });

  it("does not bypass when the key header is missing entirely", async () => {
    const app = buildTestApp(TEST_KEY);
    const res = await app.request("/finance/fx");
    expect(res.status).toBe(402);
  });

  it("never activates the bypass when DASHBOARD_INTERNAL_KEY is unset, even with a header that would otherwise match", async () => {
    const app = buildTestApp(undefined);
    const res = await app.request("/finance/fx", { headers: { "X-Internal-Key": TEST_KEY } });
    expect(res.status).toBe(402);
  });

  it("never activates the bypass when DASHBOARD_INTERNAL_KEY is an empty string", async () => {
    const app = buildTestApp("");
    const res = await app.request("/finance/fx", { headers: { "X-Internal-Key": "" } });
    expect(res.status).toBe(402);
  });

  it("does not bypass a correct key on a route outside the 5 curated financial endpoints — payment is still enforced", async () => {
    const app = buildTestApp(TEST_KEY, "/fisheries/purse-seine");
    const res = await app.request("/fisheries/purse-seine", { headers: { "X-Internal-Key": TEST_KEY } });
    expect(res.status).toBe(402);
  });
});
