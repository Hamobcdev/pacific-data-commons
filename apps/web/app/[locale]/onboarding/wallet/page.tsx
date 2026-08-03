import { getTranslations } from "next-intl/server";
import { WalletForm } from "@/components/wallet/WalletForm";
import { StepIndicator } from "@/components/onboarding/StepIndicator";

export default async function WalletPage() {
  const t = await getTranslations("Onboarding.Wallet");

  return (
    <div>
      <StepIndicator currentStep={2} totalSteps={7} />
      <div className="mt-8">
        <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
        <p className="mt-2 text-gray-600">{t("subtitle")}</p>
      </div>
      <WalletForm />
    </div>
  );
}
