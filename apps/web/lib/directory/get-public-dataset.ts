import { createServiceClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/onboarding/slug";
import type { Endpoint, Provider } from "@pdc/shared-types";

export interface PublicDataset {
  endpoint: Endpoint;
  provider: Provider;
  upvoteCount: number;
}

/**
 * Resolves a public dataset detail page's (providerSlug, datasetSlug) route
 * params back to an active endpoint + its provider. Endpoints have no
 * stored slug column (session1_migration.sql) — same slugify() convention
 * generate-endpoint-package.ts already uses for the self-hosted ZIP
 * filename, applied here to institution_name and endpoint title. POC scale
 * (a handful of providers/endpoints) makes filtering in application code
 * fine; this is not a pattern to keep at directory scale.
 *
 * Service-role read: this is a public marketing page (no auth), but the
 * anon RLS policy on endpoints (`sensitivity_level = 'public'`) doesn't
 * match international endpoints, which leave sensitivity_level NULL by
 * design (P3 — that field is government-track only). Selecting only
 * buyer-safe columns here keeps this consistent with what the directory API
 * already exposes publicly, without depending on that RLS policy.
 */
export async function getPublicDataset(providerSlug: string, datasetSlug: string): Promise<PublicDataset | null> {
  const supabase = createServiceClient();

  const { data: providers } = await supabase.from("providers").select("*").eq("is_active", true);
  const provider = (providers ?? []).find((p) => slugify(p.institution_name as string) === providerSlug) as Provider | undefined;
  if (!provider) return null;

  const { data: endpoints } = await supabase.from("endpoints").select("*").eq("provider_id", provider.id).eq("is_active", true);
  const endpoint = (endpoints ?? []).find((e) => slugify(e.title as string) === datasetSlug) as Endpoint | undefined;
  if (!endpoint) return null;

  const { count } = await supabase
    .from("community_ratings")
    .select("id", { count: "exact", head: true })
    .eq("endpoint_id", endpoint.id)
    .eq("rating", "positive")
    .eq("query_verified", true);

  return { endpoint, provider, upvoteCount: count ?? 0 };
}
