import { getTranslations } from "next-intl/server";
import { StepIndicator } from "@/components/onboarding/StepIndicator";
import { ProvenanceForm } from "@/components/provenance/ProvenanceForm";

export default async function ProvenancePage() {
  const t = await getTranslations("Onboarding.Provenance");

  return (
    <div>
      <StepIndicator currentStep={5} totalSteps={7} />
      <div className="mt-8">
        <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
        <p className="mt-2 text-gray-600">{t("subtitle")}</p>
      </div>
      <ProvenanceForm />
    </div>
  );
}
