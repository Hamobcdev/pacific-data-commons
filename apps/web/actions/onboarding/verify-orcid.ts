"use server";

import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export interface OrcidCheckResult {
  verified: boolean;
  /** Name assembled from the ORCID public record, when the lookup succeeds. */
  name: string | null;
  /** True if the check failed/was inconclusive — never blocks submission
   * (R5): a failed ORCID check always routes to manual review instead of
   * failing Step 5. */
  manualReviewPath: boolean;
}

interface OrcidRecord {
  person?: {
    name?: {
      "given-names"?: { value?: string } | null;
      "family-name"?: { value?: string } | null;
    } | null;
  };
}

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

/**
 * Live ORCID verification against the public ORCID API (CLAUDE.md Section
 * 10: "creator_verification: ORCID or institutional registry link"). Called
 * on an 800ms debounce from OrcidField — never blocks Step 5 submission,
 * an unreachable/invalid ORCID just shows "will be reviewed manually."
 */
export async function verifyOrcid(orcid: string): Promise<OrcidCheckResult> {
  const ip = await getClientIp();
  const rateLimit = checkRateLimit({ identifier: `verify-orcid:${ip}`, maxRequests: 10, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) {
    return { verified: false, name: null, manualReviewPath: true };
  }

  const trimmed = orcid.trim();
  if (!ORCID_RE.test(trimmed)) {
    return { verified: false, name: null, manualReviewPath: true };
  }

  try {
    const response = await fetch(`https://pub.orcid.org/v3.0/${trimmed}/record`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return { verified: false, name: null, manualReviewPath: true };
    }

    const record = (await response.json()) as OrcidRecord;
    const given = record.person?.name?.["given-names"]?.value ?? "";
    const family = record.person?.name?.["family-name"]?.value ?? "";
    const name = [given, family].filter(Boolean).join(" ").trim();

    if (!name) {
      return { verified: false, name: null, manualReviewPath: true };
    }

    return { verified: true, name, manualReviewPath: false };
  } catch {
    return { verified: false, name: null, manualReviewPath: true };
  }
}
