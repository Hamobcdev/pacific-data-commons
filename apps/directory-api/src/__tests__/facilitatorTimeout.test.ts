import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentGateTimeoutError, PdcPaymentGate, raceWithTimeout } from "@pdc/x402-adapter";

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

  it("still resolves via the facilitator-specific 503 at 8s, not the outer 12s deadline, when the hang is a facilitator fetch", async () => {
    // Regression guard for the new outer deadline (below): a hang mediated
    // by the facilitator client must still surface as the more specific
    // payment_facilitator_unavailable error at FACILITATOR_TIMEOUT_MS
    // (8000ms), not be swallowed by PAYMENT_GATE_TIMEOUT_MS (12000ms) firing
    // first. Since 8000 < 12000, the inner race always wins — this just
    // pins that ordering so a future change to either constant can't
    // silently invert it.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    const app = buildTestApp();
    const resPromise = app.request("/paid");

    await vi.advanceTimersByTimeAsync(8001);

    const res = await resPromise;
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "payment_facilitator_unavailable", retry_after: 10 });
  });
});

describe("PdcPaymentGate — outer payment-gate deadline (confirmed root cause, 2026-10-12: @x402/hono's Bazaar/Ajv discovery-schema self-check hangs under Cloudflare Workers with no timeout of its own, uncovered by FACILITATOR_TIMEOUT_MS since it never touches the facilitator client)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // The real-world trigger (Ajv's runtime new Function() call being
  // disallowed under workerd — see bazaarAjvWorkersLogFilter.ts) only
  // reproduces inside Cloudflare's actual Workers runtime, not Node, so it
  // can't be forced to hang deterministically here. raceWithTimeout is
  // exported specifically so the race mechanism PdcPaymentGate.middleware()
  // relies on can be verified directly in isolation instead — this is the
  // same function middleware() races the entire @x402/hono call against.

  it("rejects with PaymentGateTimeoutError when the raced operation exceeds the deadline", async () => {
    const neverResolves = () => new Promise<string>(() => {});
    const resultPromise = raceWithTimeout(12000, neverResolves, () => new PaymentGateTimeoutError(12000));
    // Attach the rejection expectation before advancing timers — the timer
    // fires (and resultPromise rejects) synchronously inside
    // advanceTimersByTimeAsync, so a handler attached only afterwards would
    // leave a brief unhandled-rejection window Node's own detector flags.
    const assertion = expect(resultPromise).rejects.toThrow("Payment gate did not complete within 12000ms");

    await vi.advanceTimersByTimeAsync(12001);
    await assertion;

    await expect(resultPromise).rejects.toBeInstanceOf(PaymentGateTimeoutError);
  });

  it("resolves normally when the raced operation completes before the deadline", async () => {
    const resolvesFast = () => Promise.resolve("ok");
    const result = await raceWithTimeout(12000, resolvesFast, () => new PaymentGateTimeoutError(12000));

    expect(result).toBe("ok");
  });

  it("propagates the operation's own rejection unchanged when it fails before the deadline", async () => {
    const domainError = new Error("something else failed");
    const failsFast = () => Promise.reject(domainError);

    await expect(raceWithTimeout(12000, failsFast, () => new PaymentGateTimeoutError(12000))).rejects.toBe(
      domainError,
    );
  });

  it("end-to-end: PdcPaymentGate.middleware() returns a clean 503 payment_gate_timeout instead of hanging when inner() itself never settles", async () => {
    // Simulates the confirmed real-world failure mode (something inside
    // @x402/hono's request processing — the Bazaar self-check in
    // production — hangs with no bound of its own) by stubbing fetch to
    // hang forever, same technique as the facilitator-specific test above,
    // but this isolates PdcPaymentGate.middleware()'s own composition: it
    // must still answer within PAYMENT_GATE_TIMEOUT_MS even in a world
    // where (hypothetically) the inner FacilitatorTimeoutError path did not
    // exist. Exercised by advancing straight past the outer deadline in one
    // jump rather than stopping at 8s, so whichever race arm wins, the
    // caller is guaranteed a 503 within 12s — the property this test is
    // actually pinning down.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    const app = buildTestApp();
    const resPromise = app.request("/paid");

    await vi.advanceTimersByTimeAsync(12001);

    const res = await resPromise;
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBeTruthy();

    const body = (await res.json()) as { error: string };
    expect(["payment_facilitator_unavailable", "payment_gate_timeout"]).toContain(body.error);
  });
});
