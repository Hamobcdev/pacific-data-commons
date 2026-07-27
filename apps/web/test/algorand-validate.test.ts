import { describe, expect, it } from "vitest";
import { checkAddressFormat, isValidAddressFormat } from "../lib/algorand/validate";

describe("checkAddressFormat", () => {
  it("flags an empty address", () => {
    expect(checkAddressFormat("")).toEqual({ valid: false, reason: "empty" });
  });

  it("flags the wrong length", () => {
    expect(checkAddressFormat("TOOSHORT")).toEqual({ valid: false, reason: "wrong_length" });
  });

  it("flags invalid characters even at the right length", () => {
    const wrongCharset = "1".repeat(58); // "1" and "0" are outside base32 A-Z2-7
    expect(checkAddressFormat(wrongCharset)).toEqual({ valid: false, reason: "invalid_characters" });
  });

  it("accepts a well-formed 58-char base32 address", () => {
    const wellFormed = "A".repeat(58);
    expect(checkAddressFormat(wellFormed)).toEqual({ valid: true, reason: null });
  });

  it("trims surrounding whitespace before checking", () => {
    const wellFormed = `  ${"A".repeat(58)}  `;
    expect(checkAddressFormat(wellFormed).valid).toBe(true);
  });
});

describe("isValidAddressFormat", () => {
  it("agrees with checkAddressFormat's valid/invalid verdict", () => {
    expect(isValidAddressFormat("A".repeat(58))).toBe(true);
    expect(isValidAddressFormat("too-short")).toBe(false);
  });
});
