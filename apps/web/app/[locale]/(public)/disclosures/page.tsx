import { getTranslations } from "next-intl/server";
import { HeaderBand } from "@/components/layout/HeaderBand";
import { PacificSidePanel } from "@/components/layout/PacificSidePanel";
import { GlobalNav } from "@/components/nav/GlobalNav";
import { GlobalFooter } from "@/components/nav/GlobalFooter";
import { DisclosuresEnquiryForm } from "@/components/disclosures/DisclosuresEnquiryForm";

// Same (public) route-group shell as faq/page.tsx and developers/page.tsx
// (no shared layout in this group — the three-column scaffold is built
// inline here). GlobalNav gets `provider={null}` unconditionally, same
// reasoning as faq/page.tsx.
export default async function DisclosuresPage() {
  const t = await getTranslations("Disclosures");

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <GlobalNav provider={null} />

      <HeaderBand>
        <div className="flex items-end h-full px-6 pb-3">
          <h1 className="text-white text-lg font-semibold">{t("title")}</h1>
        </div>
      </HeaderBand>

      <div className="flex flex-1 min-h-0">
        <PacificSidePanel side="left" />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-3xl px-6 py-10 space-y-10">
            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">{t("section1Title")}</h2>
              <p className="text-base text-gray-700 leading-relaxed">{t("section1Body")}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">{t("section2Title")}</h2>
              <p className="text-base text-gray-700 leading-relaxed">{t("section2Body")}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">{t("section3Title")}</h2>
              <p className="text-base text-gray-700 leading-relaxed">{t("section3Body")}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">{t("section4Title")}</h2>
              <p className="text-base text-gray-700 leading-relaxed">{t("section4Body")}</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-3 mb-4">{t("section5Title")}</h2>
              <p className="text-base text-gray-700 leading-relaxed mb-4">{t("section5Body")}</p>
              <DisclosuresEnquiryForm />
            </section>
          </div>
        </main>
      </div>

      <GlobalFooter />
    </div>
  );
}
