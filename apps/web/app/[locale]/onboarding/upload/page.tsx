import { getTranslations } from "next-intl/server";
import { UploadForm } from "@/components/upload/UploadForm";
import { StepIndicator } from "@/components/onboarding/StepIndicator";

export default async function UploadPage() {
  const t = await getTranslations("Onboarding.Upload");

  return (
    <div>
      <StepIndicator currentStep={3} totalSteps={7} />
      <div className="mt-8">
        <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
        <p className="mt-2 text-gray-600">{t("subtitle")}</p>
      </div>
      <UploadForm />
    </div>
  );
}
