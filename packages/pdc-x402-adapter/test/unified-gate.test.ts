import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { PdcUnifiedPaymentGate, type PdcUnifiedGateConfig } from "../src/schemes/unified-gate.js";

/**
 * x402 v2's wire format puts the full PaymentRequired payload (accepts[]
 * included) into the PAYMENT-REQUIRED response header, base64-encoded — not
 * the JSON body, which is deliberately minimal (confirmed by reading
 * @x402/core's createHTTPResponse: `body = paymentRequired.error ? {error:
 * paymentRequired.error} : {}`). Decodes that header the same way a real
 * x402 client would (decodePaymentRequiredHeader, @x402/core/http).
 */
function decodeAccepts(res: Response): Array<{ network: string; extra?: Record<string, unknown> }> {
  const header = res.headers.get("PAYMENT-REQUIRED") ?? res.headers.get("payment-required");
  if (!header) throw new Error("no PAYMENT-REQUIRED header on response");
  const decoded = decodePaymentRequiredHeader(header) as { accepts: Array<{ network: string; extra?: Record<string, unknown> }> };
  return decoded.accepts;
}

const ALGORAND_FACILITATOR_URL = "https://goplausible.test.invalid";
const PAYAI_FACILITATOR_URL = "https://payai.test.invalid";

const BASE_CONFIG: PdcUnifiedGateConfig = {
  algorandNetwork: "testnet",
  algorandFacilitatorUrl: ALGORAND_FACILITATOR_URL,
  algorandMerchantAddress: "LN745UCDQNFIBDY6JFW7FNK333MADQZQVQFMCVR3GXXUTB52O2NYPZN3YY",
  merchant: { serviceName: "Pacific Data Commons Test" },
};

const ALL_CHAINS_CONFIG: PdcUnifiedGateConfig = {
  ...BASE_CONFIG,
  enableBase: true,
  baseMerchantAddress: "0x0000000000000000000000000000000000000001",
  payaiFacilitatorUrl: PAYAI_FACILITATOR_URL,
  enableSolana: true,
  solanaMerchantAddress: "11111111111111111111111111111111",
  solanaRpcUrl: "https://api.devnet.solana.com",
};

/**
 * Mocks the two facilitators' /supported endpoints only — getSupported() is
 * the only facilitator call a 402-challenge request needs (verify/settle
 * never run; no payment header is ever sent in these tests). Same
 * fetch-stubbing technique apps/directory-api's own facilitatorTimeout.test.ts
 * already uses — not a new testing pattern introduced here.
 */
function stubFacilitators(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (!url.endsWith("/supported")) {
        throw new Error(`unexpected fetch in test: ${url}`);
      }
      if (url.startsWith(ALGORAND_FACILITATOR_URL)) {
        return new Response(
          JSON.stringify({
            kinds: [
              { x402Version: 2, scheme: "exact", network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe" },
              { x402Version: 2, scheme: "exact", network: "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith(PAYAI_FACILITATOR_URL)) {
        return new Response(
          JSON.stringify({
            kinds: [
              { x402Version: 2, scheme: "exact", network: "eip155:8453" },
              { x402Version: 2, scheme: "exact", network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch host in test: ${url}`);
    }),
  );
}

describe("PdcUnifiedPaymentGate", () => {
  // Stubbed once for the whole file, not per test (beforeEach/afterEach),
  // deliberately: @x402/hono's paymentMiddleware() fires an unawaited
  // background resourceServer.initialize() call the moment middleware() is
  // built (attachBackgroundInitHandler, @x402/core/http) — this adapter has
  // no handle on that promise to await or cancel. Swapping the global fetch
  // stub between tests left a race where a still-in-flight background call
  // from one test's gate could resolve mid-way through a LATER test, after
  // that later test had already replaced the stub with its own (functionally
  // identical, but a different vi.fn()) instance — surfacing as a spurious
  // "Unhandled Rejection: process.exit unexpectedly called" (vitest's own
  // safety net intercepting @x402/core's process.exit(1) on a
  // RouteConfigurationError) despite every actual assertion passing. One
  // consistent stub for the whole file, covering every network any test
  // here ever needs, removes the race: whichever test's background promise
  // resolves, whenever, it sees the same valid mock the whole time.
  beforeAll(() => {
    stubFacilitators();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("constructs with all three chains enabled without throwing, and middleware()/addRoute() work", () => {
    const gate = new PdcUnifiedPaymentGate(ALL_CHAINS_CONFIG);
    gate.addRoute({ method: "GET", path: "/search", priceUsdc: 0.01, description: "test", resource: "test://search" });
    gate.onSettled(() => {});
    expect(typeof gate.middleware()).toBe("function");
  });

  it("constructs with only Algorand enabled (Base/Solana flags omitted) without throwing", () => {
    const gate = new PdcUnifiedPaymentGate(BASE_CONFIG);
    gate.addRoute({ method: "GET", path: "/search", priceUsdc: 0.01, description: "test", resource: "test://search" });
    expect(typeof gate.middleware()).toBe("function");
  });

  it("GoPlausible handles Algorand alone when Base/Solana are disabled — startup log reports goplausible-scoped, both chains disabled", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    new PdcUnifiedPaymentGate(BASE_CONFIG);
    const call = infoSpy.mock.calls.find(([event]) => event === "unified_gate_initialized");
    expect(call?.[1]).toMatchObject({
      baseActive: false,
      solanaActive: false,
      facilitators: { algorand: "goplausible-scoped", base: "disabled", solana: "disabled" },
    });
    infoSpy.mockRestore();
  });

  it("GoPlausible primary for Base, PayAI fallback wired correctly when payaiFacilitatorUrl is configured", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    new PdcUnifiedPaymentGate(ALL_CHAINS_CONFIG);
    const call = infoSpy.mock.calls.find(([event]) => event === "unified_gate_initialized");
    expect(call?.[1]).toMatchObject({
      baseActive: true,
      solanaActive: true,
      facilitators: {
        algorand: "goplausible-scoped",
        base: "goplausible-primary/payai-fallback",
        solana: "goplausible-primary/payai-fallback",
      },
    });
    infoSpy.mockRestore();
  });

  it("Base/Solana run goplausible-only when enabled but payaiFacilitatorUrl is omitted", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { payaiFacilitatorUrl, ...configWithoutPayai } = ALL_CHAINS_CONFIG;
    new PdcUnifiedPaymentGate(configWithoutPayai);
    const call = infoSpy.mock.calls.find(([event]) => event === "unified_gate_initialized");
    expect(call?.[1]).toMatchObject({
      baseActive: true,
      solanaActive: true,
      facilitators: { base: "goplausible-only", solana: "goplausible-only" },
    });
    infoSpy.mockRestore();
  });

  describe("402 challenge contents", () => {
    it("with only Algorand enabled, the 402 challenge's accepts[] has exactly one entry (Algorand) — same shape PdcPaymentGate alone would produce", async () => {
      const gate = new PdcUnifiedPaymentGate(BASE_CONFIG);
      gate.addRoute({ method: "GET", path: "/paid", priceUsdc: 0.01, description: "test", resource: "https://x.invalid/paid" });
      const app = new Hono();
      app.use("*", gate.middleware());
      app.get("/paid", (c) => c.json({ ok: true }));

      const res = await app.request("/paid");
      expect(res.status).toBe(402);
      const accepts = decodeAccepts(res);
      expect(accepts).toHaveLength(1);
      expect(accepts[0]?.network).toBe("algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe");
    });

    it("with all three chains enabled, the 402 challenge's accepts[] lists Algorand, Base, and Solana together", async () => {
      const gate = new PdcUnifiedPaymentGate(ALL_CHAINS_CONFIG);
      gate.addRoute({ method: "GET", path: "/paid", priceUsdc: 0.01, description: "test", resource: "https://x.invalid/paid" });
      const app = new Hono();
      app.use("*", gate.middleware());
      app.get("/paid", (c) => c.json({ ok: true }));

      const res = await app.request("/paid");
      expect(res.status).toBe(402);
      const networks = decodeAccepts(res).map((a) => a.network);
      expect(networks).toContain("algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe");
      expect(networks).toContain("eip155:8453");
      expect(networks).toContain("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
    });

    // Step 11 — PayAI Market listing requirement: Base mainnet's accepts[]
    // entry must carry extra.name === "USD Coin", the real EIP-712 domain
    // name @x402/evm's own DEFAULT_ASSETS table declares for eip155:8453
    // (confirmed by reading that table directly — see the earlier grep
    // investigation this test formalizes). ExactEvmScheme.
    // enhancePaymentRequirements injects this automatically; this test
    // confirms it actually runs for a route registered through
    // PdcUnifiedPaymentGate, not just that the library supports it in
    // isolation.
    it("extra.name === 'USD Coin' on the Base (eip155:8453) accepts[] entry", async () => {
      const gate = new PdcUnifiedPaymentGate(ALL_CHAINS_CONFIG);
      gate.addRoute({ method: "GET", path: "/paid", priceUsdc: 0.01, description: "test", resource: "https://x.invalid/paid" });
      const app = new Hono();
      app.use("*", gate.middleware());
      app.get("/paid", (c) => c.json({ ok: true }));

      const res = await app.request("/paid");
      expect(res.status).toBe(402);
      const baseAccept = decodeAccepts(res).find((a) => a.network === "eip155:8453");
      expect(baseAccept).toBeDefined();
      expect(baseAccept?.extra?.name).toBe("USD Coin");
    });
  });
});
