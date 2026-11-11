import { describe, expect, it } from "vitest";
import { atomicUsdcToDecimalString, raceWithTimeout } from "../src/schemes/gate-shared.js";

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
