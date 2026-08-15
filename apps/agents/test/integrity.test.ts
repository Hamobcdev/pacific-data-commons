import { afterEach, describe, expect, it, vi } from "vitest";
import { checkEndpointIntegrity, getActualHash, getCertifiedHash, recordIntegrityEvent } from "../src/integrity.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getCertifiedHash", () => {
  it("returns the certified hash on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ dataset_content_hash: "abc123" }));
    vi.stubGlobal("fetch", fetchMock);

    const hash = await getCertifiedHash("end-1", "https://directory.example", "internal-key");

    expect(hash).toBe("abc123");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://directory.example/internal/certified-hash/end-1",
      expect.objectContaining({ headers: { "x-internal-api-key": "internal-key" } }),
    );
  });

  it("returns null (not throws) when directory-api errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    const hash = await getCertifiedHash("end-1", "https://directory.example", "internal-key");
    expect(hash).toBeNull();
  });

  it("returns null when the network call itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const hash = await getCertifiedHash("end-1", "https://directory.example", "internal-key");
    expect(hash).toBeNull();
  });
});

describe("getActualHash", () => {
  it("returns null without calling fetch when integrityUrl is null", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const hash = await getActualHash(null);
    expect(hash).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the hash from a reachable /integrity route", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ hash: "def456" })));
    const hash = await getActualHash("https://provider.example/integrity");
    expect(hash).toBe("def456");
  });

  it("returns null when the endpoint is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const hash = await getActualHash("https://provider.example/integrity");
    expect(hash).toBeNull();
  });
});

describe("checkEndpointIntegrity", () => {
  it("status=no_cert_hash and passed=true when no certificate exists yet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ dataset_content_hash: null })));
    const result = await checkEndpointIntegrity("end-1", "https://provider.example/integrity", "https://directory.example", "key");
    expect(result).toMatchObject({ passed: true, status: "no_cert_hash", expectedHash: null, actualHash: null });
  });

  it("status=endpoint_unavailable and passed=true when /integrity can't be reached", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ dataset_content_hash: "abc123" })) // certified-hash lookup
      .mockRejectedValueOnce(new Error("timeout")); // /integrity fetch
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkEndpointIntegrity("end-1", "https://provider.example/integrity", "https://directory.example", "key");
    expect(result).toMatchObject({ passed: true, status: "endpoint_unavailable", expectedHash: "abc123", actualHash: null });
  });

  it("status=fail and passed=false on a hash mismatch — the only status that blocks payment", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ dataset_content_hash: "abc123" }))
      .mockResolvedValueOnce(jsonResponse({ hash: "different999" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkEndpointIntegrity("end-1", "https://provider.example/integrity", "https://directory.example", "key");
    expect(result).toMatchObject({ passed: false, status: "fail", expectedHash: "abc123", actualHash: "different999" });
  });

  it("status=pass and passed=true when hashes match", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ dataset_content_hash: "abc123" }))
      .mockResolvedValueOnce(jsonResponse({ hash: "abc123" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkEndpointIntegrity("end-1", "https://provider.example/integrity", "https://directory.example", "key");
    expect(result).toMatchObject({ passed: true, status: "pass", expectedHash: "abc123", actualHash: "abc123" });
  });
});

describe("recordIntegrityEvent", () => {
  it("posts the event to directory-api and returns the parsed response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ event_id: "evt-1", integrity_fail_count: 1, integrity_flagged: false }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await recordIntegrityEvent("https://directory.example", "internal-key", {
      endpointId: "end-1",
      checkTrigger: "agent_query",
      status: "fail",
      expectedHash: "abc123",
      actualHash: "different999",
      agentId: "agent-1",
      transactionBlocked: true,
    });

    expect(result).toEqual({ event_id: "evt-1", integrity_fail_count: 1, integrity_flagged: false });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://directory.example/internal/integrity-event",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on a non-ok response — callers are responsible for catching this (fire-and-forget)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    await expect(
      recordIntegrityEvent("https://directory.example", "internal-key", {
        endpointId: "end-1",
        checkTrigger: "agent_query",
        status: "pass",
        expectedHash: "abc123",
        actualHash: "abc123",
        agentId: "agent-1",
        transactionBlocked: false,
      }),
    ).rejects.toThrow("HTTP 500");
  });
});
