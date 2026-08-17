import { Hono } from "hono";
import {
  LAW_BEFORE_CODE,
  LAW_BEFORE_CODE_SECTIONS,
  CRYPTOGRAPHIC_CONTINUITY,
  CRYPTOGRAPHIC_CONTINUITY_SECTIONS,
  INVISIBLE_INFRASTRUCTURE,
  INVISIBLE_INFRASTRUCTURE_SECTIONS,
} from "../../data/research.js";
import { DATASET_METADATA } from "../../data/fisheries.js";
import { resolveResearchTier } from "../../lib/researchTier.js";
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
 *
 * Session 23 — all three routes now accept ?tier=summary|slice|full (default
 * summary) and, for tier=slice, an optional ?section=<key>. See
 * resolveResearchTier's doc comment: depth is not priced separately —
 * index.ts registers every research path at TIER_PRICING.summary regardless
 * of tier, per Decision 42.
 */
researchRoute.get("/research/law-before-code", (c) => {
  const body = resolveResearchTier(c.req.query(), LAW_BEFORE_CODE, LAW_BEFORE_CODE_SECTIONS);
  return c.json({
    ...body,
    competition_tag: DATASET_METADATA.competition_tag,
    queried_at: new Date().toISOString(),
  });
});

researchRoute.get("/research/cryptographic-continuity", (c) => {
  const body = resolveResearchTier(c.req.query(), CRYPTOGRAPHIC_CONTINUITY, CRYPTOGRAPHIC_CONTINUITY_SECTIONS);
  return c.json({
    ...body,
    competition_tag: DATASET_METADATA.competition_tag,
    queried_at: new Date().toISOString(),
  });
});

researchRoute.get("/research/invisible-infrastructure", (c) => {
  const body = resolveResearchTier(c.req.query(), INVISIBLE_INFRASTRUCTURE, INVISIBLE_INFRASTRUCTURE_SECTIONS);
  return c.json({
    ...body,
    competition_tag: DATASET_METADATA.competition_tag,
    queried_at: new Date().toISOString(),
  });
});
