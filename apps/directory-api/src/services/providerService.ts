import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, NotFoundError } from "../lib/errors.js";
import type { Endpoint as EndpointRow, Provider as ProviderRow, PublicProviderProfile } from "@pdc/shared-types";
import { toPublicEndpoint, toPublicProvider } from "./publicProjections.js";

export type { PublicProviderProfile } from "@pdc/shared-types";

export async function getPublicProviderProfile(
  supabase: SupabaseClient,
  providerId: string,
): Promise<PublicProviderProfile> {
  const { data: providerRow, error: providerError } = await supabase
    .from("providers")
    .select("*")
    .eq("id", providerId)
    .eq("is_active", true)
    .maybeSingle();

  if (providerError) {
    throw new AppError(502, "database_error", `Provider lookup failed: ${providerError.message}`);
  }
  if (!providerRow) {
    throw new NotFoundError(`No active provider with id "${providerId}"`);
  }

  const { data: endpointRows, error: endpointsError } = await supabase
    .from("endpoints")
    .select("*")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .or("sensitivity_level.is.null,sensitivity_level.eq.public")
    .or("commercial_eligibility.is.null,commercial_eligibility.eq.fully_commercial");

  if (endpointsError) {
    throw new AppError(502, "database_error", `Endpoint lookup failed: ${endpointsError.message}`);
  }

  return {
    provider: toPublicProvider(providerRow as ProviderRow),
    endpoints: ((endpointRows ?? []) as EndpointRow[]).map(toPublicEndpoint),
  };
}
