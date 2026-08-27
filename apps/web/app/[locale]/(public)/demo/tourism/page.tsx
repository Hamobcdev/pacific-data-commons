import { getTranslations } from "next-intl/server";
import { GlobalNav } from "@/components/nav/GlobalNav";
import { HeaderBand } from "@/components/layout/HeaderBand";
import { GlobalFooter } from "@/components/nav/GlobalFooter";
import { TourismDemoForm } from "@/components/demo/TourismDemoForm";

/**
 * Session 33 — Pacific Tourism Intelligence demo page, the live
 * demonstration behind SBP's Samoa Tourism Authority proposal (see Session
 * 32's pacificTourismService.ts doc comment). Lives in the (public) route
 * group (no shared layout there, same as faq/ and downloads/finance-office-brief/
 * next to it) rather than the session brief's literal `app/[locale]/demo/tourism`
 * path — every other unauthenticated page in this app already lives under
 * (public); route groups don't affect the URL, so this still resolves to
 * /en/demo/tourism exactly as specified.
 *
 * No PacificSidePanel: that component is a route-keyed image map with no
 * entry for this route, and the session brief asked for no images on this
 * page — a focused single-column layout also suits "mobile-first" (a phone
 * screen at an STA meeting) better than the three-column scaffold its
 * siblings use.
 *
 * `?destination=WS&window=christmas_2026` seeds the form's initial
 * selection (per the brief's STA demo sequence URL) without auto-submitting
 * — the visitor still clicks "Generate Intelligence Brief" themselves,
 * since every submit spends real USDC from SBP's agent wallet.
 */
export default async function TourismDemoPage({ searchParams }: { searchParams: { destination?: string; window?: string } }) {
  const t = await getTranslations("Demo.tourism");

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <GlobalNav provider={null} />
      <HeaderBand />

      <main className="flex-1 min-w-0">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
            <p className="text-gray-600 mt-1">{t("subtitle")}</p>
          </div>

          <TourismDemoForm initialDestination={searchParams.destination} initialWindow={searchParams.window} />
        </div>
      </main>

      <GlobalFooter />
    </div>
  );
}
