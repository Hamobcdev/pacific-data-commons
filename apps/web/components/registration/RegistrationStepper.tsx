"use client";

import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import type { NationOption } from "@/app/[locale]/(public)/register/page";
import { Step1Category } from "./steps/Step1Category";
import { Step2Details } from "./steps/Step2Details";
import { Step3Review } from "./steps/Step3Review";
import { Step4Payment } from "./steps/Step4Payment";
import { Step5Confirmation } from "./steps/Step5Confirmation";

const STORAGE_KEY = "pdc_registration_draft";
const STEP_LABELS = ["Category", "Details", "Review", "Payment", "Confirmation"];

/**
 * Deliberately a loose Record rather than a strict union of per-category
 * interfaces — this wizard's shape changes with provider_category and the
 * real validation gate is lib/tourism/providerFormSchema.ts's
 * ProviderFormSchema (run in Step3Review and again, authoritatively, in
 * the registerProvider server action). Extra keys not in that schema are
 * silently stripped by Zod's default object parsing, so storing
 * wizard-only bookkeeping (referenceId, payment method) alongside real
 * form fields here is safe.
 */
export type RegistrationFormState = Record<string, unknown>;

export interface RegistrationStepperProps {
  nations: NationOption[];
}

function loadDraft(): RegistrationFormState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RegistrationFormState) : {};
  } catch {
    return {};
  }
}

function saveDraft(state: RegistrationFormState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full/unavailable (private browsing) — the form still works
    // in-memory for the current session; only cross-reload/Stripe-redirect
    // persistence is lost, not the active flow.
  }
}

function clearDraft(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function RegistrationStepper({ nations }: RegistrationStepperProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formState, setFormState] = useState<RegistrationFormState>({});
  const [registerResult, setRegisterResult] = useState<{ success: boolean; provider_id?: string; business_name?: string; error?: string } | null>(null);

  // Restore from localStorage on mount — required both for intermittent
  // Pacific connectivity (P8: forms must save state) and because Stripe
  // Checkout is a full-page redirect that would otherwise lose every field
  // the user already filled in.
  useEffect(() => {
    const draft = loadDraft();
    const params = new URLSearchParams(window.location.search);
    const stripeOutcome = params.get("stripe");

    if (Object.keys(draft).length > 0) {
      setFormState(draft);
    }

    if (stripeOutcome === "success") {
      const sessionId = params.get("session_id");
      setFormState((prev) => ({ ...draft, ...prev, _paymentMethod: "stripe", _paymentReference: sessionId ?? "" }));
      setCurrentStep(4);
      window.history.replaceState(null, "", window.location.pathname);
    } else if (stripeOutcome === "cancelled") {
      setFormState({ ...draft, _stripeCancelled: true });
      setCurrentStep(4);
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, []);

  useEffect(() => {
    if (Object.keys(formState).length > 0) {
      saveDraft(formState);
    }
  }, [formState]);

  function updateFields(patch: RegistrationFormState) {
    setFormState((prev) => ({ ...prev, ...patch }));
  }

  function goToStep(step: number) {
    setCurrentStep(step);
  }

  function handleSubmitted(result: { success: boolean; provider_id?: string; business_name?: string; error?: string }) {
    setRegisterResult(result);
    if (result.success) {
      clearDraft();
    }
    setCurrentStep(5);
  }

  return (
    <div className="space-y-6">
      <div>
        <Progress value={(currentStep / 5) * 100} label={`Step ${currentStep} of 5: ${STEP_LABELS[currentStep - 1]}`} />
        <p className="mt-2 text-xs font-medium text-gray-500">
          Step {currentStep} of 5 — {STEP_LABELS[currentStep - 1]}
        </p>
      </div>

      {currentStep === 1 && (
        <Step1Category
          formState={formState}
          onSelect={(category) => {
            updateFields({ provider_category: category });
            goToStep(2);
          }}
        />
      )}

      {currentStep === 2 && (
        <Step2Details
          formState={formState}
          nations={nations}
          updateFields={updateFields}
          onNext={() => goToStep(3)}
          onBack={() => goToStep(1)}
        />
      )}

      {currentStep === 3 && <Step3Review formState={formState} onEdit={() => goToStep(2)} onNext={() => goToStep(4)} />}

      {currentStep === 4 && (
        <Step4Payment formState={formState} updateFields={updateFields} onBack={() => goToStep(3)} onSubmitted={handleSubmitted} />
      )}

      {currentStep === 5 && <Step5Confirmation formState={formState} result={registerResult} />}
    </div>
  );
}
