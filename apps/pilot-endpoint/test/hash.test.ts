import { describe, expect, it } from "vitest";
import { computeCanonicalHash, verifyHash } from "../src/lib/hash.js";
import { FISHERIES_RECORDS, type FisheriesRecord } from "../src/data/fisheries.js";

const HEX64 = /^[0-9a-f]{64}$/;

describe("computeCanonicalHash", () => {
  it("is a 64-character lowercase hex string", () => {
    expect(computeCanonicalHash(FISHERIES_RECORDS)).toMatch(HEX64);
  });

  it("is deterministic — same input always produces same output", () => {
    const a = computeCanonicalHash(FISHERIES_RECORDS);
    const b = computeCanonicalHash(FISHERIES_RECORDS);
    expect(a).toBe(b);
  });

  it("is unaffected by object key order (keys are sorted in canonical form)", () => {
    const original: FisheriesRecord[] = [
      { year: 2018, species: "bigeye", catch_volume_mt: 420, stock_index: 0.65, vessel_type: "longline", zone: "samoa_eez", confidence_level: "synthetic" },
    ];
    const reordered: FisheriesRecord[] = [
      { zone: "samoa_eez", confidence_level: "synthetic", vessel_type: "longline", stock_index: 0.65, catch_volume_mt: 420, species: "bigeye", year: 2018 },
    ];
    expect(computeCanonicalHash(original)).toBe(computeCanonicalHash(reordered));
  });

  it("changes when a field value changes", () => {
    const original = [FISHERIES_RECORDS[0]!];
    const changed: FisheriesRecord[] = [{ ...original[0]!, catch_volume_mt: original[0]!.catch_volume_mt + 1 }];
    expect(computeCanonicalHash(original)).not.toBe(computeCanonicalHash(changed));
  });

  it("changes when record order changes — array order is part of the canonical form", () => {
    const forward = FISHERIES_RECORDS.slice(0, 2);
    const reversed = [...forward].reverse();
    expect(computeCanonicalHash(forward)).not.toBe(computeCanonicalHash(reversed));
  });

  it("changes when a record is added or removed", () => {
    const fewer = FISHERIES_RECORDS.slice(0, -1);
    expect(computeCanonicalHash(fewer)).not.toBe(computeCanonicalHash(FISHERIES_RECORDS));
  });
});

describe("verifyHash", () => {
  it("confirms a hash that matches the current dataset", () => {
    const hash = computeCanonicalHash(FISHERIES_RECORDS);
    expect(verifyHash(FISHERIES_RECORDS, hash)).toBe(true);
  });

  it("rejects a hash that does not match", () => {
    expect(verifyHash(FISHERIES_RECORDS, "0".repeat(64))).toBe(false);
  });
});
