import { getTranslations } from "next-intl/server";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { Breadcrumb } from "@/components/nav/Breadcrumb";

export default async function ChecklistPage() {
  const t = await getTranslations("Onboarding.Checklist");
  const tBreadcrumb = await getTranslations("Breadcrumb");

  const groups = [
    {
      heading: t("institutionHeading"),
      items: [t("institutionEmail"), t("institutionAuthority"), t("institutionPacific")],
    },
    {
      heading: t("dataHeading"),
      items: [t("dataRegion"), t("dataRights"), t("dataConsent"), t("dataCollection"), t("dataCoverage")],
    },
    {
      heading: t("walletHeading"),
      items: [t("walletHave"), t("walletUsdc")],
    },
    {
      heading: t("earningHeading"),
      items: [t("earningPerQuery"), t("earningSplit"), t("earningUsdc"), t("earningNoGuarantee")],
    },
  ];

  return (
    <div>
      <Breadcrumb
        items={[
          { label: tBreadcrumb("getStarted"), href: "/welcome" },
          { label: tBreadcrumb("checklist") },
        ]}
      />
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>

      <div className="mt-8">
        <OnboardingChecklist groups={groups} />
      </div>

      <div className="mt-10 rounded-lg bg-light-bg p-5">
        <h2 className="text-base font-semibold text-navy">{t("whatHappensTitle")}</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-700">
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
          <li>{t("step4")}</li>
          <li>{t("step5")}</li>
        </ol>
        <p className="mt-4 text-sm text-gray-500">{t("questionsContact")}</p>
      </div>
    </div>
  );
}
