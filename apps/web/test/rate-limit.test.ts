import { describe, expect, it } from "vitest";
import { checkRateLimit } from "../lib/rate-limit";

describe("checkRateLimit", () => {
  it("allows requests up to the configured maximum", () => {
    const identifier = `test:${crypto.randomUUID()}`;
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit({ identifier, maxRequests: 5, windowMs: 60_000 });
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks the request once the maximum is exceeded within the window", () => {
    const identifier = `test:${crypto.randomUUID()}`;
    for (let i = 0; i < 5; i++) {
      checkRateLimit({ identifier, maxRequests: 5, windowMs: 60_000 });
    }
    const result = checkRateLimit({ identifier, maxRequests: 5, windowMs: 60_000 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks separate identifiers independently", () => {
    const a = `test:${crypto.randomUUID()}`;
    const b = `test:${crypto.randomUUID()}`;
    for (let i = 0; i < 5; i++) checkRateLimit({ identifier: a, maxRequests: 5, windowMs: 60_000 });
    const resultA = checkRateLimit({ identifier: a, maxRequests: 5, windowMs: 60_000 });
    const resultB = checkRateLimit({ identifier: b, maxRequests: 5, windowMs: 60_000 });
    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });
});
