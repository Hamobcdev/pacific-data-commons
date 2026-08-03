import { getTranslations } from "next-intl/server";
import { StepIndicator } from "@/components/onboarding/StepIndicator";
import { CompleteLayout } from "@/components/complete/CompleteLayout";

export default async function CompletePage() {
  const t = await getTranslations("Onboarding.Complete");

  return (
    <div>
      <StepIndicator currentStep={7} totalSteps={7} />
      <div className="mt-8">
        <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      </div>
      <CompleteLayout />
    </div>
  );
}
