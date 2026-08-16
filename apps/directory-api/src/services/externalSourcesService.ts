import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../lib/errors.js";

export interface PublicExternalSource {
  id: string;
  name: string;
  description: string;
  data_category: string;
  price_usdc: number;
  provider_name: string;
  provider_url: string | null;
  geographic_scope: string;
}

/**
 * GET /external-sources (Session 19 / Decision 56) — public list of every
 * SBP-approved external x402 source, for the competition submission
 * documentation to reference as evidence of cross-platform x402
 * interoperability. Deliberately omits endpoint_url: this route is a
 * public catalogue for humans/documentation, not a machine-callable
 * discovery feed for agents — an agent's actual permission to query a
 * specific source (and that source's real endpoint_url) comes from
 * agent_external_source_permissions, resolved directly by apps/agents
 * (see externalSourceClient.ts), not from this route.
 */
export async function listActiveExternalSources(supabase: SupabaseClient): Promise<PublicExternalSource[]> {
  const { data, error } = await supabase
    .from("approved_external_sources")
    .select("id, name, description, data_category, price_usdc, provider_name, provider_url, geographic_scope")
    .eq("is_active", true)
    .order("approved_at", { ascending: true });

  if (error) {
    throw new AppError(502, "database_error", `External source lookup failed: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    ...row,
    price_usdc: Number(row.price_usdc),
  })) as PublicExternalSource[];
}
