import { getTranslations } from "next-intl/server";
import { StepIndicator } from "@/components/onboarding/StepIndicator";
import { ReviewLayout } from "@/components/review/ReviewLayout";

export default async function ReviewPage() {
  const t = await getTranslations("Onboarding.Review");

  return (
    <div>
      <StepIndicator currentStep={4} totalSteps={7} />
      <div className="mt-8">
        <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      </div>
      <ReviewLayout />
    </div>
  );
}
