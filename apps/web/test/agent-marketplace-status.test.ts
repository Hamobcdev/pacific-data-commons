import { afterEach, describe, expect, it } from "vitest";
import { isAgentMarketplaceEnabled } from "../lib/agents/marketplaceStatus";

describe("isAgentMarketplaceEnabled", () => {
  const original = process.env.NEXT_PUBLIC_AGENTS_MARKETPLACE_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_AGENTS_MARKETPLACE_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_AGENTS_MARKETPLACE_ENABLED = original;
    }
  });

  it("defaults to disabled when the env var is unset", () => {
    delete process.env.NEXT_PUBLIC_AGENTS_MARKETPLACE_ENABLED;
    expect(isAgentMarketplaceEnabled()).toBe(false);
  });

  it("is disabled for anything other than the literal string 'true'", () => {
    for (const value of ["True", "TRUE", "1", "yes", ""]) {
      process.env.NEXT_PUBLIC_AGENTS_MARKETPLACE_ENABLED = value;
      expect(isAgentMarketplaceEnabled()).toBe(false);
    }
  });

  it("is enabled only when set to the literal string 'true'", () => {
    process.env.NEXT_PUBLIC_AGENTS_MARKETPLACE_ENABLED = "true";
    expect(isAgentMarketplaceEnabled()).toBe(true);
  });
});
