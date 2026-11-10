import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdcPaymentGate } from "@pdc/x402-adapter";
import { findMissingRequiredParamMessage, preGateRequiredParamValidation } from "../middleware/preGateRequiredParams.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";

// Not a real wallet — same dummy Mainnet-shaped address already used in
// wellKnownX402.test.ts/facilitatorTimeout.test.ts/dashboardBypass.test.ts.
const TEST_AVM_ADDRESS = "LN745UCDQNFIBDY6JFW7FNK333MADQZQVQFMCVR3GXXUTB52O2NYPZN3YY";

// Algorand mainnet's CAIP-2 id — see dashboardBypass.test.ts's identical
// constant/comment for why this exact value is required for
// x402ResourceServer.initialize() to accept the stubbed /supported response.
const ALGORAND_MAINNET_CAIP2 = "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k";

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

describe("findMissingRequiredParamMessage (pure check)", () => {
  const present = (value: string) => () => value;
  const absent = () => undefined;

  describe("GET routes", () => {
    it.each([
      ["/pacific/weather", "country"],
      ["/algorand/wallet-balance", "address"],
      ["/climate/ocean-temperature", "country"],
      ["/finance/fiji-gdp", "year"],
      ["/fisheries/pacific-purse-seine", "year"],
      ["/finance/crypto-history", "symbol"],
      ["/intelligence/pacific-travel", "destination"],
    ])("flags %s as missing when ?%s= is absent", (path) => {
      const message = findMissingRequiredParamMessage("GET", path, absent, undefined);
      expect(message).not.toBeNull();
      expect(typeof message).toBe("string");
    });

    it.each([
      ["/pacific/weather", "country", "WS"],
      ["/algorand/wallet-balance", "address", "ALGORAND_ADDRESS_58_CHARS"],
      ["/climate/ocean-temperature", "country", "WS"],
      ["/finance/fiji-gdp", "year", "2019"],
      ["/fisheries/pacific-purse-seine", "year", "2020"],
      ["/finance/crypto-history", "symbol", "ALGO"],
      ["/intelligence/pacific-travel", "destination", "WS"],
    ])("passes %s through when ?%s= is present, regardless of value correctness", (path, _param, value) => {
      // Deliberately an invalid-looking value (e.g. an unsupported country) —
      // this check must only test presence, never value correctness.
      expect(findMissingRequiredParamMessage("GET", path, present(value), undefined)).toBeNull();
      expect(findMissingRequiredParamMessage("GET", path, present("not-a-real-value"), undefined)).toBeNull();
    });

    it("treats a whitespace-only value as absent", () => {
      expect(findMissingRequiredParamMessage("GET", "/pacific/weather", present("   "), undefined)).not.toBeNull();
    });

    it("returns the exact message GET /pacific/weather's own handler already throws", () => {
      expect(findMissingRequiredParamMessage("GET", "/pacific/weather", absent, undefined)).toBe("country is required, e.g. ?country=WS");
    });

    it("returns the exact message GET /algorand/wallet-balance's own handler already throws", () => {
      expect(findMissingRequiredParamMessage("GET", "/algorand/wallet-balance", absent, undefined)).toBe(
        "address query parameter is required, e.g. ?address=ALGORAND_ADDRESS_58_CHARS",
      );
    });

    it("is a no-op for a route with no required param (e.g. /finance/fx)", () => {
      expect(findMissingRequiredParamMessage("GET", "/finance/fx", absent, undefined)).toBeNull();
    });

    it("is a no-op for an unregistered path", () => {
      expect(findMissingRequiredParamMessage("GET", "/not/a/real/route", absent, undefined)).toBeNull();
    });
  });

  describe("POST Agent Dataset Gateway routes", () => {
    it.each([
      ["weather", "country"],
      ["wallet-balance", "address"],
      ["ocean-temperature", "country"],
      ["fiji-gdp", "year"],
      ["pacific-purse-seine", "year"],
      ["crypto-history", "symbol"],
      ["pacific-travel", "destination"],
    ])("flags dataset %s as missing when params.%s is absent from the body", (datasetId, param) => {
      const path = `/api/v1/datasets/${datasetId}/query`;
      expect(findMissingRequiredParamMessage("POST", path, absent, {})).not.toBeNull();
      expect(findMissingRequiredParamMessage("POST", path, absent, undefined)).not.toBeNull();
      // sanity: param name itself matches what the rule actually checks
      expect(findMissingRequiredParamMessage("POST", path, absent, { [param]: "x" })).toBeNull();
    });

    it("uses the gateway's own body-shaped message for wallet-balance, not the GET query-string one", () => {
      const message = findMissingRequiredParamMessage("POST", "/api/v1/datasets/wallet-balance/query", absent, {});
      expect(message).toBe('address is required, e.g. { "params": { "address": "ALGORAND_ADDRESS_58_CHARS" } }');
    });

    it("accepts a numeric value (e.g. a JSON number for year), not just a string", () => {
      expect(findMissingRequiredParamMessage("POST", "/api/v1/datasets/fiji-gdp/query", absent, { year: 2019 })).toBeNull();
    });

    it("is a no-op for a dataset with no required param (e.g. fx)", () => {
      expect(findMissingRequiredParamMessage("POST", "/api/v1/datasets/fx/query", absent, {})).toBeNull();
    });

    it("is a no-op for an unrelated POST path", () => {
      expect(findMissingRequiredParamMessage("POST", "/payment/verify", absent, {})).toBeNull();
    });
  });

  it("is a no-op for any other method", () => {
    expect(findMissingRequiredParamMessage("HEAD", "/pacific/weather", absent, undefined)).toBeNull();
    expect(findMissingRequiredParamMessage("PUT", "/pacific/weather", absent, undefined)).toBeNull();
  });
});

/**
 * Integration tests — same pattern as dashboardBypass.test.ts: a minimal
 * standalone app wiring preGateRequiredParamValidation() before a real
 * PdcPaymentGate, so these exercise the actual mount order fixed in
 * app.ts, not just the pure function above.
 */
function buildTestApp(routes: Array<{ method: "GET" | "POST"; path: string }>) {
  const paymentGate = new PdcPaymentGate({
    payToAddress: TEST_AVM_ADDRESS,
    facilitatorUrl: "https://facilitator.example.invalid",
    network: "mainnet",
  });
  for (const route of routes) {
    paymentGate.addRoute({
      method: route.method,
      path: route.path,
      priceUsdc: 0.01,
      description: "test route",
      resource: `https://api.example.invalid${route.path}`,
    });
  }

  const app = new Hono();
  app.use("*", preGateRequiredParamValidation());
  app.use("*", paymentGate.middleware());
  for (const route of routes) {
    if (route.method === "GET") {
      app.get(route.path, (c) => c.json({ ok: true }));
    } else {
      app.post(route.path, (c) => c.json({ ok: true }));
    }
  }
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("preGateRequiredParamValidation — mounted before the real payment gate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("400s GET /pacific/weather with no country, never reaching the route handler", async () => {
    // PdcPaymentGate fires its own background /supported warm-up fetch on
    // construction, independent of any request — not what this test is
    // about, so stub it rather than asserting on fetch call count. What
    // this test actually proves: the response is the pre-gate 400 (not the
    // gate's own 402, and not the route handler's { ok: true }).
    stubSupportedFacilitatorResponse();

    const app = buildTestApp([{ method: "GET", path: "/pacific/weather" }]);
    const res = await app.request("/pacific/weather");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("invalid_request");
    expect(body.message).toBe("country is required, e.g. ?country=WS");
  });

  it("reaches the real gate and returns 402 with a PAYMENT-REQUIRED header when country IS present", async () => {
    stubSupportedFacilitatorResponse();

    const app = buildTestApp([{ method: "GET", path: "/pacific/weather" }]);
    const res = await app.request("/pacific/weather?country=WS");

    expect(res.status).toBe(402);
    expect(res.headers.get("payment-required")).toBeTruthy();
  });

  it("400s GET /algorand/wallet-balance with no address, before the gate", async () => {
    stubSupportedFacilitatorResponse();

    const app = buildTestApp([{ method: "GET", path: "/algorand/wallet-balance" }]);
    const res = await app.request("/algorand/wallet-balance");

    expect(res.status).toBe(400);
  });

  it("400s GET /finance/fiji-gdp with no year, before the gate", async () => {
    stubSupportedFacilitatorResponse();

    const app = buildTestApp([{ method: "GET", path: "/finance/fiji-gdp" }]);
    const res = await app.request("/finance/fiji-gdp");

    expect(res.status).toBe(400);
  });

  it("does not interfere with a clean route that has no required param (/finance/fx still gates normally)", async () => {
    stubSupportedFacilitatorResponse();

    const app = buildTestApp([{ method: "GET", path: "/finance/fx" }]);
    const res = await app.request("/finance/fx");

    expect(res.status).toBe(402);
  });

  it("400s POST /api/v1/datasets/weather/query with no params.country in the body, before the gate", async () => {
    stubSupportedFacilitatorResponse();

    const app = buildTestApp([{ method: "POST", path: "/api/v1/datasets/weather/query" }]);
    const res = await app.request("/api/v1/datasets/weather/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ params: {} }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("invalid_request");
    expect(body.message).toBe("country is required, e.g. ?country=WS");
  });

  it("400s POST /api/v1/datasets/weather/query with no body at all, before the gate", async () => {
    stubSupportedFacilitatorResponse();

    const app = buildTestApp([{ method: "POST", path: "/api/v1/datasets/weather/query" }]);
    const res = await app.request("/api/v1/datasets/weather/query", { method: "POST" });

    expect(res.status).toBe(400);
  });

  it("reaches the real gate and returns 402 when params.country IS present in the body", async () => {
    stubSupportedFacilitatorResponse();

    const app = buildTestApp([{ method: "POST", path: "/api/v1/datasets/weather/query" }]);
    const res = await app.request("/api/v1/datasets/weather/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ params: { country: "WS" } }),
    });

    expect(res.status).toBe(402);
    expect(res.headers.get("payment-required")).toBeTruthy();
  });

  it("400s POST /api/v1/datasets/wallet-balance/query with the gateway's own body-shaped message, not the GET one", async () => {
    const app = buildTestApp([{ method: "POST", path: "/api/v1/datasets/wallet-balance/query" }]);
    const res = await app.request("/api/v1/datasets/wallet-balance/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ params: {} }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.message).toBe('address is required, e.g. { "params": { "address": "ALGORAND_ADDRESS_58_CHARS" } }');
  });
});
