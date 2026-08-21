import { getTranslations } from "next-intl/server";
import { UploadForm } from "@/components/upload/UploadForm";
import { UploadPaymentGate } from "@/components/upload/UploadPaymentGate";
import { DataFlowExplainer } from "@/components/upload/DataFlowExplainer";
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
      {/* Deliberately outside the payment gate — visible regardless of
          founding-partner/paid/unpaid state, before any file is uploaded. */}
      <DataFlowExplainer />
      <UploadPaymentGate>
        <UploadForm />
      </UploadPaymentGate>
    </div>
  );
}
