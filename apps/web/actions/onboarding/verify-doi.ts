"use server";

import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export interface DoiCheckResult {
  verified: boolean;
  /** Paper title returned by CrossRef, when the lookup succeeds. */
  title: string | null;
  /** True if the check failed/was inconclusive — never blocks submission
   * (R5), same pattern as verify-orcid.ts. */
  manualReviewPath: boolean;
}

interface CrossrefWork {
  message?: {
    title?: string[];
  };
}

/**
 * Live DOI verification against the CrossRef public API (CLAUDE.md Section
 * 8, Gold tier: "SBP checks (clerical only): DOI resolves via CrossRef").
 * Called on an 800ms debounce from DoiField — never blocks Step 5
 * submission, an unresolvable DOI just shows "will be reviewed manually."
 */
export async function verifyDoi(doi: string): Promise<DoiCheckResult> {
  const ip = await getClientIp();
  const rateLimit = checkRateLimit({ identifier: `verify-doi:${ip}`, maxRequests: 10, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) {
    return { verified: false, title: null, manualReviewPath: true };
  }

  const trimmed = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  if (!trimmed) {
    return { verified: false, title: null, manualReviewPath: true };
  }

  try {
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(trimmed)}`);

    if (!response.ok) {
      return { verified: false, title: null, manualReviewPath: true };
    }

    const work = (await response.json()) as CrossrefWork;
    const title = work.message?.title?.[0] ?? null;

    if (!title) {
      return { verified: false, title: null, manualReviewPath: true };
    }

    return { verified: true, title, manualReviewPath: false };
  } catch {
    return { verified: false, title: null, manualReviewPath: true };
  }
}
