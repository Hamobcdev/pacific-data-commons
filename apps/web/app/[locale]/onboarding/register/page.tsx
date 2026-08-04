import { getTranslations } from "next-intl/server";
import { RegistrationForm } from "@/components/register/RegistrationForm";
import { StepIndicator } from "@/components/onboarding/StepIndicator";
import { InstitutionalPanel } from "@/components/register/InstitutionalPanel";
import { ResumeLink } from "@/components/onboarding/ResumeLink";

export default async function RegisterPage() {
  const t = await getTranslations("Onboarding.Register");

  return (
    // Breaks out of the shared onboarding shell's centered max-w-2xl column
    // (components/onboarding/layout.tsx's <main>) at lg+ — standard "full
    // bleed" trick (relative + left/right 1/2 + negative 50vw margin) that
    // computes from the viewport, not the parent, so it works regardless of
    // the parent's own width/padding. No-ops below lg, where the panel is
    // hidden anyway, so every other onboarding step is unaffected.
    <div className="lg:relative lg:left-1/2 lg:right-1/2 lg:w-screen lg:-mx-[50vw]">
      <div className="flex">
        {/* Form — takes remaining space; min-w-0 stops a flex child from
            overflowing its column instead of wrapping/shrinking within it. */}
        <div className="flex-1 min-w-0 px-8 py-12">
          <div className="max-w-2xl mx-auto">
            <StepIndicator currentStep={1} totalSteps={7} />
            <div className="mt-8">
              <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
              <p className="mt-2 text-gray-600">{t("subtitle")}</p>
              {/* Independent of form fill state — opens the same magic-link
                  resume flow RegistrationForm's own bottom ResumeLink does,
                  just reachable without seeing or touching the form. */}
              <div className="mt-3">
                <ResumeLink variant="top" />
              </div>
              <div className="mt-4 p-4 bg-light-bg rounded-lg">
                <p className="text-sm text-navy">{t("pilot_notice")}</p>
              </div>
            </div>
            <RegistrationForm />
          </div>
        </div>

        {/* Panel — fixed width, desktop only, never shrinks below w-80. */}
        <div className="hidden lg:block w-80 flex-shrink-0">
          <InstitutionalPanel />
        </div>
      </div>
    </div>
  );
}
