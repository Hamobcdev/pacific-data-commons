import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdcPaymentGate } from "@pdc/x402-adapter";

// Not a real wallet — same dummy Mainnet-shaped address already used in
// wellKnownX402.test.ts. Only needs to be structurally valid; nothing in
// this test actually settles a payment against it.
const TEST_AVM_ADDRESS = "LN745UCDQNFIBDY6JFW7FNK333MADQZQVQFMCVR3GXXUTB52O2NYPZN3YY";

/**
 * Minimal standalone app — not app.ts's createApp() — isolates this test
 * from Supabase/env setup entirely, since the only thing under test is
 * PdcPaymentGate.middleware()'s facilitator-timeout handling.
 */
function buildTestApp() {
  const paymentGate = new PdcPaymentGate({
    payToAddress: TEST_AVM_ADDRESS,
    facilitatorUrl: "https://facilitator.example.invalid",
    network: "mainnet",
  });
  paymentGate.addRoute({
    method: "GET",
    path: "/paid",
    priceUsdc: 0.01,
    description: "test route",
    resource: "https://api.example.invalid/paid",
  });

  const app = new Hono();
  app.use("*", paymentGate.middleware());
  app.get("/paid", (c) => c.json({ ok: true }));
  return app;
}

describe("PdcPaymentGate — facilitator timeout (regression: 2026-10-03 production hang on /finance/*, /search, /algorand/wallet-balance)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns a clean 503 with Retry-After instead of hanging when the facilitator never responds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})), // never resolves — simulates GoPlausible hanging
    );

    const app = buildTestApp();
    const resPromise = app.request("/paid");

    // FACILITATOR_TIMEOUT_MS (8000ms, packages/pdc-x402-adapter/src/index.ts)
    await vi.advanceTimersByTimeAsync(8001);

    const res = await resPromise;
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("10");

    const body = await res.json();
    expect(body).toEqual({ error: "payment_facilitator_unavailable", retry_after: 10 });
  });
});
