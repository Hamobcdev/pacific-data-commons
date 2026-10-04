import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getResumedProvider } from "@/lib/onboarding/resume";
import { listPublicEndpoints } from "@/lib/directory/get-public-listings";
import { formatUsdcPrice } from "@/lib/format/usdc";
import { GlobalNav } from "@/components/nav/GlobalNav";
import { GlobalFooter } from "@/components/nav/GlobalFooter";
import { HeaderBand } from "@/components/layout/HeaderBand";
import { PacificSidePanel } from "@/components/layout/PacificSidePanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TrustTierBadge } from "@/components/ui/TrustTierBadge";
import type { DataCategory } from "@pdc/shared-types";

// Session1 migration's endpoints.data_category CHECK constraint (extended
// Session 20 with governance/financial_flows/research — see
// packages/shared-types/src/endpoints.ts's DataCategory), listed here once
// for this page's filter dropdown rather than importing a runtime array
// from a types-only package.
const CATEGORIES: DataCategory[] = [
  "fisheries",
  "climate",
  "trade",
  "demographics",
  "health",
  "agriculture",
  "cultural",
  "remittance",
  "legal",
  "geospatial",
  "energy",
  "carbon",
  "tourism",
  "disaster_risk",
  "biodiversity",
  "ocean",
  "education",
  "governance",
  "financial_flows",
  "research",
  "other",
];

/**
 * Public buyer entry point (Session 19, Fix 4) — browse without login. No
 * client JS needed: category/search are plain GET form fields read via
 * searchParams, same server-rendered-filter approach the rest of this
 * (public) group uses. See lib/directory/get-public-listings.ts for why
 * this reads Supabase directly rather than paying its own $0.01 x402
 * directory-query fee to query itself.
 */
export default async function BrowseDataPage({ searchParams }: { searchParams: { q?: string; category?: string } }) {
  const t = await getTranslations("BrowseData");
  const provider = await getResumedProvider();
  const listings = await listPublicEndpoints({ q: searchParams.q, category: searchParams.category });

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <GlobalNav provider={provider} />
      <HeaderBand>
        <div className="flex items-end h-full px-6 pb-3">
          <h1 className="text-white text-lg font-semibold">{t("title")}</h1>
        </div>
      </HeaderBand>

      <div className="flex flex-1 min-h-0">
        <PacificSidePanel side="left" />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-4xl px-6 py-10 space-y-6">
            <div>
              <p className="text-sm text-gray-500">{t("noAccountNotice")}</p>
              <p className="mt-1 text-sm text-gray-500">
                {t("becomeProviderPrompt")}{" "}
                <Link href="/onboarding/register" className="text-ocean hover:underline">
                  {t("becomeProviderCta")} →
                </Link>
              </p>
            </div>

            <form method="get" className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="search"
                name="q"
                defaultValue={searchParams.q ?? ""}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchLabel")}
                className="flex-1"
              />
              <select
                name="category"
                defaultValue={searchParams.category ?? ""}
                aria-label={t("categoryLabel")}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm min-h-[44px]"
              >
                <option value="">{t("allCategories")}</option>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <Button type="submit" className="min-h-[44px]">
                {t("searchButton")}
              </Button>
            </form>

            {listings.length === 0 ? (
              <p className="text-sm text-gray-500">{t("noResults")}</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {listings.map((listing) => (
                  <Link key={`${listing.providerSlug}/${listing.datasetSlug}`} href={`/data/${listing.providerSlug}/${listing.datasetSlug}`}>
                    <Card className="h-full hover:border-ocean transition-colors">
                      <CardHeader>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{listing.category}</span>
                          <TrustTierBadge tier={listing.trustTier} upvoteCount={listing.upvoteCount} />
                        </div>
                        <CardTitle className="mt-2">{listing.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="line-clamp-2">{listing.description}</p>
                        <p className="mt-3 text-xs text-gray-500">
                          {listing.institutionName} · {listing.country}
                        </p>
                        <p className="mt-1 text-sm font-medium text-navy">{t("fromPrice", { price: formatUsdcPrice(listing.lowestPriceUsdc) })}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <GlobalFooter />
    </div>
  );
}
