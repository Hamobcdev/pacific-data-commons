import { describe, expect, it } from "vitest";
import { declareUpdateSchema, confirmUpdateSchema } from "../lib/dashboard/update-validation";

describe("declareUpdateSchema", () => {
  const valid = {
    updateCategory: "additive" as const,
    changeDescription: "Added Q2 2026 tuna stock records covering July through September.",
  };

  it("accepts a valid additive declaration with only the required fields", () => {
    const result = declareUpdateSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.newParameters).toEqual([]);
      expect(result.data.dateRangeExtended).toBe(false);
    }
  });

  it("rejects a description under 20 characters", () => {
    const result = declareUpdateSchema.safeParse({ ...valid, changeDescription: "Too short" });
    expect(result.success).toBe(false);
  });

  it("rejects a description over 500 characters", () => {
    const result = declareUpdateSchema.safeParse({ ...valid, changeDescription: "a".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("rejects a category outside the four declarable categories (e.g. initial_certification)", () => {
    const result = declareUpdateSchema.safeParse({ ...valid, updateCategory: "initial_certification" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative records_added", () => {
    const result = declareUpdateSchema.safeParse({ ...valid, recordsAdded: -1 });
    expect(result.success).toBe(false);
  });

  it("accepts new parameters and date range extension", () => {
    const result = declareUpdateSchema.safeParse({
      ...valid,
      updateCategory: "expansion",
      newParameters: ["water_temperature_c", "salinity_ppt"],
      dateRangeExtended: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.newParameters).toEqual(["water_temperature_c", "salinity_ppt"]);
    }
  });
});

describe("confirmUpdateSchema", () => {
  it("accepts a valid 64-character hex hash", () => {
    const result = confirmUpdateSchema.safeParse({ newHash: "a".repeat(64) });
    expect(result.success).toBe(true);
  });

  it("accepts an uppercase hex hash", () => {
    const result = confirmUpdateSchema.safeParse({ newHash: "A".repeat(64) });
    expect(result.success).toBe(true);
  });

  it("trims incidental whitespace from a pasted hash", () => {
    const result = confirmUpdateSchema.safeParse({ newHash: `  ${"a".repeat(64)}  ` });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.newHash).toBe("a".repeat(64));
    }
  });

  it("rejects a hash that isn't 64 hex characters", () => {
    expect(confirmUpdateSchema.safeParse({ newHash: "a".repeat(63) }).success).toBe(false);
    expect(confirmUpdateSchema.safeParse({ newHash: "not-hex-at-all" }).success).toBe(false);
  });
});
