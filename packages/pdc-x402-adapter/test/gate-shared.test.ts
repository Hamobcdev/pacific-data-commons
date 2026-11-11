import { describe, expect, it, vi } from "vitest";
import type { FacilitatorClient } from "@x402/core/server";
import { SettleError } from "@x402/core/types";
import type { Network, PaymentPayload, PaymentRequirements, SettleResponse, SupportedResponse, VerifyResponse } from "@x402/core/types";
import {
  ChainScopedFacilitatorClient,
  FallbackFacilitatorClient,
  FacilitatorTimeoutError,
  atomicUsdcToDecimalString,
  raceWithTimeout,
} from "../src/schemes/gate-shared.js";

const BASE_NETWORK = "eip155:8453" as Network;
const SOLANA_NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" as Network;

function fakeSupported(networks: Network[]): SupportedResponse {
  return {
    kinds: networks.map((network) => ({ x402Version: 2, scheme: "exact", network })),
    extensions: [],
    signers: {},
  };
}

function fakeVerify(overrides: Partial<VerifyResponse> = {}): VerifyResponse {
  return { isValid: true, ...overrides };
}

function fakeSettle(overrides: Partial<SettleResponse> = {}): SettleResponse {
  return { success: true, transaction: "0xtest", network: BASE_NETWORK, ...overrides };
}

const DUMMY_PAYLOAD = {} as PaymentPayload;
const DUMMY_REQUIREMENTS = {} as PaymentRequirements;

describe("atomicUsdcToDecimalString", () => {
  it("converts whole-dollar atomic amounts", () => {
    expect(atomicUsdcToDecimalString("1000000")).toBe("1");
  });

  it("converts sub-dollar atomic amounts without losing precision", () => {
    expect(atomicUsdcToDecimalString("10000")).toBe("0.01");
    expect(atomicUsdcToDecimalString("300")).toBe("0.0003");
  });

  it("drops trailing zero fraction digits", () => {
    expect(atomicUsdcToDecimalString("1500000")).toBe("1.5");
  });

  it("handles zero", () => {
    expect(atomicUsdcToDecimalString("0")).toBe("0");
  });

  it("handles amounts smaller than one atomic-unit digit group", () => {
    expect(atomicUsdcToDecimalString("1")).toBe("0.000001");
  });
});

describe("raceWithTimeout", () => {
  it("resolves with the run() value when it finishes first", async () => {
    const result = await raceWithTimeout(1000, () => Promise.resolve("done"), () => new Error("timed out"));
    expect(result).toBe("done");
  });

  it("rejects with onTimeout()'s error when the timer wins", async () => {
    const neverResolves = () => new Promise<string>(() => {});
    await expect(raceWithTimeout(10, neverResolves, () => new Error("timed out"))).rejects.toThrow("timed out");
  });

  it("propagates run()'s own rejection without waiting for the timer", async () => {
    await expect(
      raceWithTimeout(1000, () => Promise.reject(new Error("boom")), () => new Error("timed out")),
    ).rejects.toThrow("boom");
  });
});

describe("ChainScopedFacilitatorClient", () => {
  it("filters getSupported() to only the allowed networks", async () => {
    const inner: FacilitatorClient = {
      getSupported: async () => fakeSupported([BASE_NETWORK, SOLANA_NETWORK]),
      verify: async () => fakeVerify(),
      settle: async () => fakeSettle(),
    };
    const scoped = new ChainScopedFacilitatorClient(inner, [BASE_NETWORK]);

    const supported = await scoped.getSupported();

    expect(supported.kinds).toHaveLength(1);
    expect(supported.kinds[0]?.network).toBe(BASE_NETWORK);
  });

  it("passes verify/settle through to the inner client unchanged", async () => {
    const verify = vi.fn(async () => fakeVerify({ payer: "0xpayer" }));
    const settle = vi.fn(async () => fakeSettle({ transaction: "0xsettled" }));
    const inner: FacilitatorClient = { getSupported: async () => fakeSupported([BASE_NETWORK]), verify, settle };
    const scoped = new ChainScopedFacilitatorClient(inner, [BASE_NETWORK]);

    const verifyResult = await scoped.verify(DUMMY_PAYLOAD, DUMMY_REQUIREMENTS);
    const settleResult = await scoped.settle(DUMMY_PAYLOAD, DUMMY_REQUIREMENTS);

    expect(verify).toHaveBeenCalledWith(DUMMY_PAYLOAD, DUMMY_REQUIREMENTS);
    expect(settle).toHaveBeenCalledWith(DUMMY_PAYLOAD, DUMMY_REQUIREMENTS);
    expect(verifyResult.payer).toBe("0xpayer");
    expect(settleResult.transaction).toBe("0xsettled");
  });
});

describe("FallbackFacilitatorClient", () => {
  it("uses primary when it succeeds, and never calls fallback", async () => {
    const primaryVerify = vi.fn(async () => fakeVerify({ payer: "primary" }));
    const fallbackVerify = vi.fn(async () => fakeVerify({ payer: "fallback" }));
    const client = new FallbackFacilitatorClient(
      { getSupported: async () => fakeSupported([BASE_NETWORK]), verify: primaryVerify, settle: async () => fakeSettle() },
      { getSupported: async () => fakeSupported([BASE_NETWORK]), verify: fallbackVerify, settle: async () => fakeSettle() },
    );

    const result = await client.verify(DUMMY_PAYLOAD, DUMMY_REQUIREMENTS);

    expect(result.payer).toBe("primary");
    expect(fallbackVerify).not.toHaveBeenCalled();
  });

  it("uses fallback when primary throws", async () => {
    const client = new FallbackFacilitatorClient(
      {
        getSupported: async () => fakeSupported([BASE_NETWORK]),
        verify: async () => {
          throw new Error("primary unreachable");
        },
        settle: async () => fakeSettle(),
      },
      { getSupported: async () => fakeSupported([BASE_NETWORK]), verify: async () => fakeVerify({ payer: "fallback" }), settle: async () => fakeSettle() },
    );

    const result = await client.verify(DUMMY_PAYLOAD, DUMMY_REQUIREMENTS);

    expect(result.payer).toBe("fallback");
  });

  it("uses fallback when primary verify() resolves with isValid: false", async () => {
    const client = new FallbackFacilitatorClient(
      {
        getSupported: async () => fakeSupported([BASE_NETWORK]),
        verify: async () => fakeVerify({ isValid: false, invalidReason: "primary_rejected" }),
        settle: async () => fakeSettle(),
      },
      { getSupported: async () => fakeSupported([BASE_NETWORK]), verify: async () => fakeVerify({ payer: "fallback" }), settle: async () => fakeSettle() },
    );

    const result = await client.verify(DUMMY_PAYLOAD, DUMMY_REQUIREMENTS);

    expect(result.isValid).toBe(true);
    expect(result.payer).toBe("fallback");
  });

  it("getSupported() unions primary and fallback kinds rather than returning only primary's", async () => {
    const client = new FallbackFacilitatorClient(
      { getSupported: async () => fakeSupported([]), verify: async () => fakeVerify(), settle: async () => fakeSettle() },
      { getSupported: async () => fakeSupported([BASE_NETWORK]), verify: async () => fakeVerify(), settle: async () => fakeSettle() },
    );

    const supported = await client.getSupported();

    expect(supported.kinds.map((k) => k.network)).toContain(BASE_NETWORK);
  });

  // Beyond the literal test list — these three protect the settle()
  // double-settlement safety logic described in FallbackFacilitatorClient's
  // own doc comment, which the task didn't explicitly ask for a test of but
  // which is load-bearing: settlement moves real funds, unlike verify().
  describe("settle() double-settlement safety", () => {
    it("falls back on a clean, terminal primary failure", async () => {
      const client = new FallbackFacilitatorClient(
        {
          getSupported: async () => fakeSupported([BASE_NETWORK]),
          verify: async () => fakeVerify(),
          settle: async () => fakeSettle({ success: false, errorReason: "invalid_signature" }),
        },
        {
          getSupported: async () => fakeSupported([BASE_NETWORK]),
          verify: async () => fakeVerify(),
          settle: async () => fakeSettle({ transaction: "0xfallback" }),
        },
      );

      const result = await client.settle(DUMMY_PAYLOAD, DUMMY_REQUIREMENTS);

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xfallback");
    });

    it("does NOT fall back when primary throws FacilitatorTimeoutError (unknown broadcast outcome)", async () => {
      const fallbackSettle = vi.fn(async () => fakeSettle({ transaction: "0xfallback" }));
      const client = new FallbackFacilitatorClient(
        {
          getSupported: async () => fakeSupported([BASE_NETWORK]),
          verify: async () => fakeVerify(),
          settle: async () => {
            throw new FacilitatorTimeoutError("settle", 15000);
          },
        },
        { getSupported: async () => fakeSupported([BASE_NETWORK]), verify: async () => fakeVerify(), settle: fallbackSettle },
      );

      await expect(client.settle(DUMMY_PAYLOAD, DUMMY_REQUIREMENTS)).rejects.toThrow(FacilitatorTimeoutError);
      expect(fallbackSettle).not.toHaveBeenCalled();
    });

    it("does NOT fall back when primary returns a settlement_pending result", async () => {
      const fallbackSettle = vi.fn(async () => fakeSettle({ transaction: "0xfallback" }));
      const client = new FallbackFacilitatorClient(
        {
          getSupported: async () => fakeSupported([BASE_NETWORK]),
          verify: async () => fakeVerify(),
          settle: async () => fakeSettle({ success: false, errorReason: "settlement_pending", transaction: "0xprimary-pending" }),
        },
        { getSupported: async () => fakeSupported([BASE_NETWORK]), verify: async () => fakeVerify(), settle: fallbackSettle },
      );

      const result = await client.settle(DUMMY_PAYLOAD, DUMMY_REQUIREMENTS);

      expect(result.transaction).toBe("0xprimary-pending");
      expect(fallbackSettle).not.toHaveBeenCalled();
    });

    it("does NOT fall back when primary throws a SettleError with settlement_pending", async () => {
      const fallbackSettle = vi.fn(async () => fakeSettle({ transaction: "0xfallback" }));
      const pendingError = new SettleError(500, {
        success: false,
        errorReason: "settlement_pending",
        transaction: "0xprimary-pending",
        network: BASE_NETWORK,
      });
      const client = new FallbackFacilitatorClient(
        {
          getSupported: async () => fakeSupported([BASE_NETWORK]),
          verify: async () => fakeVerify(),
          settle: async () => {
            throw pendingError;
          },
        },
        { getSupported: async () => fakeSupported([BASE_NETWORK]), verify: async () => fakeVerify(), settle: fallbackSettle },
      );

      await expect(client.settle(DUMMY_PAYLOAD, DUMMY_REQUIREMENTS)).rejects.toThrow(pendingError);
      expect(fallbackSettle).not.toHaveBeenCalled();
    });
  });
});
