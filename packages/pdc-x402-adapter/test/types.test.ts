import { describe, expect, it } from "vitest";
import { splitProviderAndSbp } from "../src/types.js";

describe("splitProviderAndSbp", () => {
  it("splits 97/3 per Decision 11/16", () => {
    const { providerAmountUsd, sbpAmountUsd } = splitProviderAndSbp(1);
    expect(providerAmountUsd).toBeCloseTo(0.97, 6);
    expect(sbpAmountUsd).toBeCloseTo(0.03, 6);
  });

  it("always sums exactly to the input amount, including sub-cent prices", () => {
    for (const amount of [0.01, 0.1, 1, 3.33, 19.15]) {
      const { providerAmountUsd, sbpAmountUsd } = splitProviderAndSbp(amount);
      expect(providerAmountUsd + sbpAmountUsd).toBeCloseTo(amount, 6);
    }
  });

  it("rounds to USDC's 6-decimal precision, not 2", () => {
    const { sbpAmountUsd } = splitProviderAndSbp(0.01);
    expect(sbpAmountUsd).toBeCloseTo(0.0003, 6);
  });
});
