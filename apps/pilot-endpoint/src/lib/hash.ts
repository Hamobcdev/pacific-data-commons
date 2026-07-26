import { createHash } from "node:crypto";
import type { FisheriesRecord } from "../data/fisheries.js";

/**
 * Recursively sorts object keys alphabetically while preserving array
 * element order — the PDC canonical serialisation rule (CLAUDE.md Section
 * 10) sorts keys "at every level" but never reorders arrays, since element
 * order is part of the dataset's identity (record order is meaningful).
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort((a, b) => a.localeCompare(b))) {
      sorted[key] = canonicalize(record[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Computes a SHA-256 hash of the dataset using the PDC canonical serialisation
 * rule (CLAUDE.md Section 10 — mandatory before any pilot provider goes live):
 * JSON datasets are stringified with keys sorted alphabetically at every
 * level, no whitespace, UTF-8 encoding. Array order is preserved.
 *
 * This ensures any buyer independently computing the hash from the served
 * data gets the same result, enabling trustless provenance verification via
 * the /integrity route.
 *
 * The hash is computed ONCE at server startup and cached — never per-request
 * (see src/index.ts).
 */
export function computeCanonicalHash(records: FisheriesRecord[]): string {
  const serialised = JSON.stringify(canonicalize(records));
  return createHash("sha256").update(serialised, "utf8").digest("hex");
}

/**
 * Verifies that a given hash matches the canonical hash of the provided
 * records. Used by the /integrity route to confirm the dataset has not
 * changed since the certified/startup-computed value.
 */
export function verifyHash(records: FisheriesRecord[], claimedHash: string): boolean {
  return computeCanonicalHash(records) === claimedHash;
}
