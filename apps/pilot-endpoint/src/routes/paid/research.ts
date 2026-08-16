import { Hono } from "hono";
import { LAW_BEFORE_CODE, CRYPTOGRAPHIC_CONTINUITY } from "../../data/research.js";
import { DATASET_METADATA } from "../../data/fisheries.js";
import type { AppBindings } from "../../types.js";

export const researchRoute = new Hono<AppBindings>();

/**
 * Session 21 (Deliverable 1, Decision 42 / PDC-POL-2026-001) — structured
 * queryable metadata for SBP working papers, priced at Tier 1 (summary)
 * maximum. The underlying document stays openly accessible on request; PDC
 * hosts the structured queryable layer only. Not a PDP envelope
 * (buildPDPResponse in lib/response.ts is fisheries-specific — category,
 * sub_category, and dataset hash all hardcoded to that dataset) — these
 * responses match the shape the working papers themselves define.
 */
researchRoute.get("/research/law-before-code", (c) => {
  return c.json({
    ...LAW_BEFORE_CODE,
    competition_tag: DATASET_METADATA.competition_tag,
    queried_at: new Date().toISOString(),
  });
});

researchRoute.get("/research/cryptographic-continuity", (c) => {
  return c.json({
    ...CRYPTOGRAPHIC_CONTINUITY,
    competition_tag: DATASET_METADATA.competition_tag,
    queried_at: new Date().toISOString(),
  });
});
