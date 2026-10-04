import { describe, expect, it } from "vitest";
import { formatUsdcPrice } from "../lib/format/usdc";

describe("formatUsdcPrice", () => {
  it("keeps the standard two-decimal display for prices of one cent or more", () => {
    expect(formatUsdcPrice(0.01)).toBe("0.01");
    expect(formatUsdcPrice(0.5)).toBe("0.50");
    expect(formatUsdcPrice(25)).toBe("25.00");
  });

  it("shows $0.00 for a genuinely free price rather than falling into the sub-cent path", () => {
    expect(formatUsdcPrice(0)).toBe("0.00");
  });

  it("shows the real value for sub-cent prices instead of rounding to $0.00 (the FX regression)", () => {
    expect(formatUsdcPrice(0.001)).toBe("0.001");
    expect(formatUsdcPrice(0.002)).toBe("0.002");
    expect(formatUsdcPrice(0.005)).toBe("0.005");
  });

  it("trims trailing zeros rather than padding sub-cent values to 6 decimals", () => {
    expect(formatUsdcPrice(0.0001)).toBe("0.0001");
  });
});
