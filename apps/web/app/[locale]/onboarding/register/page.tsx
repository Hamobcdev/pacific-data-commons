import { getTranslations } from "next-intl/server";
import { RegistrationForm } from "@/components/register/RegistrationForm";
import { StepIndicator } from "@/components/onboarding/StepIndicator";
import { ResumeOtp } from "@/components/onboarding/ResumeOtp";

/**
 * Session 12 fix: this page used to break out of the shared onboarding
 * shell's centred column with a full-bleed trick (relative + left/right 1/2
 * + negative 50vw margin) so it could render its own two-column layout with
 * a second InstitutionalPanel. That trick assumed it was the only content
 * between the viewport edges — once the shell gained a persistent left
 * Pacific panel (PacificSidePanel), the negative-margin math no longer had
 * a stable reference point and the two InstitutionalPanels doubled up.
 * Normalizing this page onto the same plain `max-w-2xl mx-auto` content
 * column every other onboarding step already uses removes both problems at
 * once — the layout's single InstitutionalPanel is now the only one, on
 * every onboarding route including this one.
 */
export default async function RegisterPage() {
  const t = await getTranslations("Onboarding.Register");

  return (
    <div>
      <StepIndicator currentStep={1} totalSteps={7} />
      <div className="mt-8">
        <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
        <p className="mt-2 text-gray-600">{t("subtitle")}</p>
        {/* Independent of form fill state — opens the same OTP resume flow
            RegistrationForm's own bottom ResumeOtp does, just reachable
            without seeing or touching the form. */}
        <div className="mt-3">
          <ResumeOtp variant="top" />
        </div>
        <div className="mt-4 p-4 bg-light-bg rounded-lg">
          <p className="text-sm text-navy">{t("pilot_notice")}</p>
        </div>
      </div>
      <RegistrationForm />
    </div>
  );
}
