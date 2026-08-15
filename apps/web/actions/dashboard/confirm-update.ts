"use server";

import { getResumedProvider } from "@/lib/onboarding/resume";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnedEndpoint } from "@/lib/dashboard/versions";
import { confirmUpdateSchema, type ConfirmUpdateInput } from "@/lib/dashboard/update-validation";
import type { UpdateCategory } from "@pdc/shared-types";

export interface ConfirmUpdateResult {
  success: boolean;
  error?: string;
  versionNumber?: number;
}

const CATEGORIES_REQUIRING_RECERTIFICATION: UpdateCategory[] = ["expansion", "methodology_change"];

const HASH_FETCH_TIMEOUT_MS = 5000;

/** Fetches the provider's own /integrity route directly — small enough
 * (and app-boundary-local enough, same as apps/agents/src/integrity.ts's
 * getActualHash and apps/pilot-endpoint/src/lib/hash.ts each having their
 * own copy of hash logic) that duplicating it here beats adding a
 * cross-app workspace dependency from apps/web onto @pdc/agents. */
async function fetchActualHash(integrityUrl: string): Promise<string | null> {
  try {
    const res = await fetch(integrityUrl, { signal: AbortSignal.timeout(HASH_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as { hash?: string };
    return body.hash ?? null;
  } catch {
    return null;
  }
}

/**
 * Declare-update wizard Step 4's "Submit new hash to complete update"
 * (Session 18, Deliverable 4 / Deliverable 2 Route 2). The provider's
 * submitted hash is never trusted on its own — this independently
 * re-fetches the provider's live /integrity route and only proceeds if the
 * two match, so a provider genuinely cannot certify a hash they haven't
 * actually published (Mirror Question Check in the session brief).
 */
export async function confirmUpdate(endpointId: string, versionId: string, input: ConfirmUpdateInput): Promise<ConfirmUpdateResult> {
  const resumed = await getResumedProvider();
  if (!resumed) {
    return { success: false, error: "Your session has expired. Please sign in again." };
  }

  const endpoint = await getOwnedEndpoint(resumed.providerId, endpointId);
  if (!endpoint) {
    return { success: false, error: "Endpoint not found." };
  }
  if (!endpoint.pending_recertification) {
    return { success: false, error: "This endpoint has no update in progress." };
  }
  if (!endpoint.integrity_url) {
    return { success: false, error: "This endpoint has no /integrity route configured — cannot verify the update." };
  }

  const parsed = confirmUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Please check the hash you entered." };
  }
  const data: ConfirmUpdateInput = parsed.data;

  const supabase = createServiceClient();

  const { data: versionRow } = await supabase
    .from("endpoint_versions")
    .select("*")
    .eq("id", versionId)
    .eq("endpoint_id", endpointId)
    .is("certified_at", null)
    .maybeSingle();

  if (!versionRow) {
    return { success: false, error: "No pending update found for this endpoint with that version id." };
  }
  const version = versionRow as { id: string; version_number: number; update_category: UpdateCategory };

  const actualHash = await fetchActualHash(endpoint.integrity_url);
  if (!actualHash) {
    return { success: false, error: "Could not reach your endpoint's /integrity route. Confirm it is live and try again." };
  }
  if (actualHash.toLowerCase() !== data.newHash.toLowerCase()) {
    return {
      success: false,
      error: "The hash you submitted doesn't match what your /integrity route currently returns. Make sure your data update is deployed, then try again.",
    };
  }

  const requiresRecertification = CATEGORIES_REQUIRING_RECERTIFICATION.includes(version.update_category);
  const now = new Date().toISOString();

  // On-chain hash anchoring (algorand_tx_id) is not implemented this
  // session — apps/web has no Algorand signing capability anywhere in this
  // codebase (that lives in apps/agents/apps/pilot-endpoint via
  // @pdc/x402-adapter, a different app). Decision 52's "records the new
  // version on-chain" is therefore not fully met yet; flagged in the
  // session report as a real gap, not silently skipped.
  const { error: versionUpdateError } = await supabase
    .from("endpoint_versions")
    .update({
      dataset_content_hash: actualHash,
      certified_at: now,
      recertification_required: requiresRecertification,
    })
    .eq("id", versionId);

  if (versionUpdateError) {
    return { success: false, error: "Could not complete certification. Please try again." };
  }

  const { error: endpointUpdateError } = await supabase
    .from("endpoints")
    .update({
      dataset_content_hash: actualHash,
      version_number: version.version_number,
      pending_recertification: false,
      pending_recertification_since: null,
      latest_version_id: versionId,
    })
    .eq("id", endpointId);

  if (endpointUpdateError) {
    return { success: false, error: "Certification recorded but the endpoint could not be updated. Contact SBP." };
  }

  if (requiresRecertification) {
    const { error: queueError } = await supabase.from("verification_queue").insert({
      provider_id: resumed.providerId,
      endpoint_id: endpointId,
      queue_type: "recertification",
      status: "queued",
    });
    if (queueError) {
      // Not fatal to the confirm flow — the update is genuinely certified
      // and live either way; a missed queue entry means SBP has to notice
      // and re-add it manually, logged for visibility rather than failing
      // an already-successful certification.
      console.error("[confirmUpdate] verification_queue insert failed", queueError.message);
    }
  }

  try {
    const directoryApiUrl = process.env.DIRECTORY_API_URL;
    const internalApiKey = process.env.INTERNAL_API_KEY;
    if (directoryApiUrl && internalApiKey) {
      const res = await fetch(`${directoryApiUrl.replace(/\/$/, "")}/internal/dispatch-update-notifications`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-api-key": internalApiKey },
        body: JSON.stringify({ endpoint_id: endpointId, version_id: versionId }),
      });
      if (!res.ok) {
        console.error("[confirmUpdate] notification dispatch returned", res.status);
      }
    } else {
      console.warn("[confirmUpdate] DIRECTORY_API_URL/INTERNAL_API_KEY not configured — notifications not dispatched");
    }
  } catch (err) {
    // Same posture as the queue insert above — the certification already
    // succeeded and must be returned as a success regardless of whether
    // downstream notification dispatch worked.
    console.error("[confirmUpdate] notification dispatch failed", err instanceof Error ? err.message : String(err));
  }

  return { success: true, versionNumber: version.version_number };
}
