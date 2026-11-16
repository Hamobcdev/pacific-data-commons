import { describe, expect, it } from "vitest";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { mirrorPaymentRequiredIntoBody } from "../src/schemes/gate-shared.js";

const PAYMENT_REQUIRED = {
  x402Version: 2,
  error: "Payment required",
  resource: { url: "https://api.example.invalid/pacific/weather", description: "test", mimeType: "application/json" },
  accepts: [
    { scheme: "exact", network: "eip155:8453", amount: "10000", asset: "0xusdc", payTo: "0xmerchant", maxTimeoutSeconds: 60, extra: {} },
    { scheme: "exact", network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", amount: "10000", asset: "usdc", payTo: "sol", maxTimeoutSeconds: 60, extra: {} },
  ],
} as unknown as PaymentRequired;

function challenge(contentType = "application/json"): Response {
  return new Response(JSON.stringify({ error: "Payment required" }), {
    status: 402,
    headers: { "content-type": contentType, "payment-required": encodePaymentRequiredHeader(PAYMENT_REQUIRED) },
  });
}

describe("mirrorPaymentRequiredIntoBody", () => {
  it("replaces the 402 body with the decoded PAYMENT-REQUIRED header, keeping the header", async () => {
    const res = mirrorPaymentRequiredIntoBody(challenge());
    expect(res.status).toBe(402);
    expect(res.headers.get("payment-required")).toBe(encodePaymentRequiredHeader(PAYMENT_REQUIRED));
    const body = (await res.json()) as PaymentRequired;
    expect(body).toEqual(PAYMENT_REQUIRED);
    expect(body.accepts).toHaveLength(2);
  });

  it("leaves non-402 responses untouched", () => {
    const ok = new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    expect(mirrorPaymentRequiredIntoBody(ok)).toBe(ok);
  });

  it("leaves a 402 without a PAYMENT-REQUIRED header untouched", () => {
    const res = new Response("{}", { status: 402, headers: { "content-type": "application/json" } });
    expect(mirrorPaymentRequiredIntoBody(res)).toBe(res);
  });

  it("leaves a browser paywall (HTML) 402 untouched", () => {
    const res = challenge("text/html");
    expect(mirrorPaymentRequiredIntoBody(res)).toBe(res);
  });

  it("leaves the response untouched when the header cannot be decoded", () => {
    const res = new Response("{}", { status: 402, headers: { "content-type": "application/json", "payment-required": "%%%not-base64%%%" } });
    expect(mirrorPaymentRequiredIntoBody(res)).toBe(res);
  });
});
