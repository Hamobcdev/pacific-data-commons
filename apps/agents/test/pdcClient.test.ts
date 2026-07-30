import { describe, expect, it, vi } from "vitest";
import { PdcClient } from "../src/pdcClient.js";

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

describe("PdcClient.get", () => {
  it("returns parsed data and decoded settlement on a successful paid response", async () => {
    const payingFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        { results: [] },
        {
          headers: {
            "PAYMENT-RESPONSE": Buffer.from(
              JSON.stringify({ success: true, transaction: "TX123", payer: "PAYER_ADDR" }),
            ).toString("base64"),
          },
        },
      ),
    );

    const client = new PdcClient("AGENT_ADDR", payingFetch as unknown as typeof fetch);
    const result = await client.get<{ results: unknown[] }>("https://directory.example/search");

    expect(payingFetch).toHaveBeenCalledWith("https://directory.example/search");
    expect(result.data).toEqual({ results: [] });
    expect(result.txId).toBe("TX123");
    expect(result.payerAddress).toBe("PAYER_ADDR");
  });

  it("returns null settlement fields when no PAYMENT-RESPONSE header is present", async () => {
    const payingFetch = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new PdcClient("AGENT_ADDR", payingFetch as unknown as typeof fetch);

    const result = await client.get("https://directory.example/search");

    expect(result.txId).toBeNull();
    expect(result.payerAddress).toBeNull();
  });

  it("throws on a non-2xx response instead of returning partial data", async () => {
    const payingFetch = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "payment_required" }, { status: 402 }));
    const client = new PdcClient("AGENT_ADDR", payingFetch as unknown as typeof fetch);

    await expect(client.get("https://directory.example/search")).rejects.toThrow("HTTP 402");
  });
});
