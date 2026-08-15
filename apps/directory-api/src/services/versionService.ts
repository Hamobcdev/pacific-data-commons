import type { SupabaseClient } from "@supabase/supabase-js";
import type { EndpointVersion, EndpointVersionsResponse } from "@pdc/shared-types";
import { AppError, NotFoundError } from "../lib/errors.js";

/**
 * GET /endpoints/:endpointId/versions (Session 18, Deliverable 2 Route 3 /
 * Deliverable 7's "agent version feed"). Public, no auth, no x402 gate —
 * version history is transparent (P7). Looked up by direct ID the same way
 * endpointService.getPublicEndpointDetail is, and for the same reason: a
 * buyer checking version history for a paused/flagged endpoint still needs
 * to see it.
 */
export async function getVersionHistory(supabase: SupabaseClient, endpointId: string): Promise<EndpointVersionsResponse> {
  const { data: endpointRow, error: endpointError } = await supabase
    .from("endpoints")
    .select("id, version_number")
    .eq("id", endpointId)
    .maybeSingle();

  if (endpointError) {
    throw new AppError(502, "database_error", `Endpoint lookup failed: ${endpointError.message}`);
  }
  if (!endpointRow) {
    throw new NotFoundError(`No endpoint with id "${endpointId}"`);
  }

  const { data: versionRows, error: versionsError } = await supabase
    .from("endpoint_versions")
    .select("*")
    .eq("endpoint_id", endpointId)
    .order("version_number", { ascending: false });

  if (versionsError) {
    throw new AppError(502, "database_error", `Version history lookup failed: ${versionsError.message}`);
  }

  const rows = (versionRows ?? []) as EndpointVersion[];

  return {
    endpoint_id: endpointId,
    current_version: (endpointRow as { version_number: number }).version_number,
    versions: rows.map((row) => ({
      version_number: row.version_number,
      update_category: row.update_category,
      provider_change_description: row.provider_change_description,
      records_added: row.records_added,
      records_modified: row.records_modified,
      records_removed: row.records_removed,
      new_parameters: row.new_parameters,
      date_range_extended: row.date_range_extended,
      certified_at: row.certified_at,
      recertification_required: row.recertification_required,
      algorand_tx_id: row.algorand_tx_id,
      declared_at: row.declared_at,
    })),
  };
}
