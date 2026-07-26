import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, NotFoundError } from "../lib/errors.js";
import type { EndpointRow } from "../lib/dbTypes.js";
import { toPublicEndpoint, type PublicEndpoint } from "./publicProjections.js";

/**
 * Looked up by direct ID rather than through /search, so — unlike search —
 * this does not require is_active. A buyer checking a paused endpoint after
 * a dispute flag, or verifying a purchase made before a pause, still needs
 * to resolve it and see the pause reason (CLAUDE.md P7: transparency). It
 * still excludes anything outside the PDC international commercial scope
 * (P3: jurisdiction/OGIP-internal data is never surfaced here).
 */
export async function getPublicEndpointDetail(
  supabase: SupabaseClient,
  endpointId: string,
): Promise<PublicEndpoint> {
  const { data, error } = await supabase
    .from("endpoints")
    .select("*")
    .eq("id", endpointId)
    .or("sensitivity_level.is.null,sensitivity_level.eq.public")
    .or("commercial_eligibility.is.null,commercial_eligibility.eq.fully_commercial")
    .maybeSingle();

  if (error) {
    throw new AppError(502, "database_error", `Endpoint lookup failed: ${error.message}`);
  }
  if (!data) {
    throw new NotFoundError(`No endpoint with id "${endpointId}"`);
  }

  return toPublicEndpoint(data as EndpointRow);
}
