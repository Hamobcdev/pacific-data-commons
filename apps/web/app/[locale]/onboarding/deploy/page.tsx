import { getTranslations } from "next-intl/server";
import { StepIndicator } from "@/components/onboarding/StepIndicator";
import { DeployLayout } from "@/components/deploy/DeployLayout";

export default async function DeployPage() {
  const t = await getTranslations("Onboarding.Deploy");

  return (
    <div>
      <StepIndicator currentStep={6} totalSteps={7} />
      <div className="mt-8">
        <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
        <p className="mt-2 text-gray-600">{t("subtitle")}</p>
      </div>
      <DeployLayout />
    </div>
  );
}
