import { Hono } from "hono";
import { DATASET_METADATA } from "../../data/fisheries.js";
import type { AppBindings } from "../../types.js";

export const provenanceRoute = new Hono<AppBindings>();

/**
 * Provenance certificate placeholder. During POC this returns the canonical
 * hash as the provenance anchor; a real on-chain Algorand provenance
 * certificate (v1.1, CLAUDE.md Section 10) is issued once Session 4's
 * cert-minting service and Supabase are live.
 */
provenanceRoute.get("/provenance", (c) => {
  return c.json({
    schema_version: "pdp-1.0",
    provenance_type: "canonical_hash",
    dataset_canonical_hash: c.get("datasetHash"),
    hash_algorithm: "sha256",
    canonical_rule: "JSON keys sorted alphabetically, no whitespace, UTF-8 encoding",
    cert_status: "pending_mainnet_cert",
    cert_note:
      "Full on-chain Algorand provenance certificate will be issued in Session 4 when Supabase and cert minting service are live",
    metadata: DATASET_METADATA,
    computed_at: c.get("hashComputedAt"),
  });
});
