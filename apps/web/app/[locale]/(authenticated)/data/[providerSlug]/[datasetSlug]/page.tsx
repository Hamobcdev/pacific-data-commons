import { notFound } from "next/navigation";
import { getPublicDataset } from "@/lib/directory/get-public-dataset";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrustTierBadge } from "@/components/ui/TrustTierBadge";
import { ShareButtons } from "@/components/ui/ShareButtons";

export default async function DatasetDetailPage({
  params,
}: {
  params: { providerSlug: string; datasetSlug: string };
}) {
  const result = await getPublicDataset(params.providerSlug, params.datasetSlug);
  if (!result) notFound();

  const { endpoint, provider, upvoteCount } = result;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const datasetUrl = `${appUrl}/data/${params.providerSlug}/${params.datasetSlug}`;
  const lowestPrice = endpoint.pricing_tiers.reduce(
    (min, tier) => (tier.price_usdc < min ? tier.price_usdc : min),
    endpoint.pricing_tiers[0]?.price_usdc ?? 0,
  );

  return (
    // Session 12 fix: mx-auto removed — the (authenticated) layout's flex
    // row already centres this column between the two side panels.
    <div className="max-w-3xl px-4 py-12 space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{endpoint.data_category}</Badge>
          <TrustTierBadge tier={provider.trust_tier} upvoteCount={upvoteCount} />
        </div>
        <h1 className="mt-3 text-2xl font-bold text-navy">{endpoint.title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {provider.institution_name} · {provider.country}
        </p>
        <p className="mt-4 text-gray-700">{endpoint.description}</p>
      </div>

      <ShareButtons
        datasetName={endpoint.title}
        providerName={provider.institution_name}
        datasetUrl={datasetUrl}
        pricePerQuery={`$${lowestPrice.toFixed(2)}`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-gray-100">
            {endpoint.pricing_tiers.map((tier) => (
              <li key={tier.tier} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-navy">{tier.name}</p>
                  <p className="text-xs text-gray-500">{tier.description}</p>
                </div>
                <span className="font-medium text-navy">${tier.price_usdc.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <p>
            {endpoint.geography_region ?? "Not specified"}
            {endpoint.time_period_start && endpoint.time_period_end
              ? ` · ${endpoint.time_period_start}–${endpoint.time_period_end}`
              : ""}
          </p>
          <p className="mt-1">{endpoint.total_queries} successful {endpoint.total_queries === 1 ? "query" : "queries"} to date</p>
        </CardContent>
      </Card>

      <a
        href="/agents"
        className="inline-block rounded-lg bg-ocean px-5 py-2.5 text-sm font-medium text-white hover:bg-ocean/90"
      >
        Query this dataset
      </a>
    </div>
  );
}
