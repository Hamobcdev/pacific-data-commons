"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { provenanceSchema, type ProvenanceData } from "@/lib/onboarding/validation";
import { getServerMessage } from "@/lib/i18n/server-messages";
import { validateOnboardingSession, InvalidOnboardingSessionError } from "@/lib/onboarding/session";

export interface SaveProvenanceResult {
  success: boolean;
  error?: string;
  field?: string;
  nextStep?: "/onboarding/deploy";
}

/**
 * Step 5 submit. Deliberately does NOT require ORCID or DOI to have
 * verified successfully — those are live, best-effort checks (R5); the
 * declaration is saved with whatever verification state it's in and SBP's
 * clerical review (Gold tier, CLAUDE.md Section 8) is the actual gate on
 * trust-tier consequences, not this form. Saved to providers.provenance_declaration
 * (session6_provenance_field.sql) — no new table, one declaration per
 * provider during the POC single-dataset onboarding flow.
 */
export async function saveProvenance(providerId: string, sessionToken: string, data: ProvenanceData): Promise<SaveProvenanceResult> {
  try {
    await validateOnboardingSession(providerId, sessionToken);
  } catch (err) {
    return { success: false, error: err instanceof InvalidOnboardingSessionError ? err.message : "Invalid session." };
  }

  const parsed = provenanceSchema.safeParse(data);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "Please complete all required fields.", field: firstIssue?.path.join(".") };
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from("providers")
    .update({
      provenance_declaration: {
        methodology: parsed.data.methodology,
        researchers: parsed.data.researchers.map((r) => ({
          name: r.name,
          orcid: r.orcid,
          orcid_verified: r.orcidStatus === "verified",
          orcid_verified_name: r.orcidVerifiedName,
        })),
        doi: parsed.data.doi || null,
        doi_verified: parsed.data.doiStatus === "verified",
        doi_verified_title: parsed.data.doiVerifiedTitle,
        peer_review_status: parsed.data.peerReviewStatus || "none",
        peer_review_venue: parsed.data.peerReviewVenue || null,
        funding_source: parsed.data.fundingSource || null,
        known_limitations: parsed.data.knownLimitations || null,
        declared_at: new Date().toISOString(),
      },
    })
    .eq("id", providerId);

  if (error) {
    console.error("Provenance save failed:", error);
    return { success: false, error: getServerMessage("actions.saveProvenance.genericError") };
  }

  return { success: true, nextStep: "/onboarding/deploy" };
}
