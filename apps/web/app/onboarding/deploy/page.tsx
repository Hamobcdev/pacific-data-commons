import { getTranslations } from "next-intl/server";
import { StepIndicator } from "@/components/onboarding/StepIndicator";

export default async function DeployPage() {
  const t = await getTranslations("Onboarding.scaffold");
  return (
    <div>
      <StepIndicator currentStep={6} totalSteps={7} />
      <div className="mt-8 rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">{t("comingSoon")}</div>
    </div>
  );
}
