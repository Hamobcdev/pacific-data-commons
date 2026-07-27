import { getTranslations } from "next-intl/server";
import { RegistrationForm } from "@/components/register/RegistrationForm";
import { StepIndicator } from "@/components/onboarding/StepIndicator";

export default async function RegisterPage() {
  const t = await getTranslations("Onboarding.Register");

  return (
    <div>
      <StepIndicator currentStep={1} totalSteps={7} />
      <div className="mt-8">
        <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
        <p className="mt-2 text-gray-600">{t("subtitle")}</p>
        <div className="mt-4 p-4 bg-light-bg rounded-lg">
          <p className="text-sm text-navy">{t("pilot_notice")}</p>
        </div>
      </div>
      <RegistrationForm />
    </div>
  );
}
