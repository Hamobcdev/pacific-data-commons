import { Alert } from "@/components/ui/alert";
import type { RegistrationFormState } from "../RegistrationStepper";
import type { RegisterProviderResult } from "@/actions/tourism/registerProvider";

export interface Step5ConfirmationProps {
  formState: RegistrationFormState;
  result: RegisterProviderResult | null;
}

export function Step5Confirmation({ formState, result }: Step5ConfirmationProps) {
  const businessName = result?.business_name ?? (formState.business_name as string) ?? "your business";
  const contactEmail = (formState.contact_email as string) ?? "";

  // Bank transfer never goes through registerProvider() — there is no
  // verified payment and no provider row yet, only the user's declared
  // intent (Step4Payment.tsx's handleBankTransferContinue). Must be checked
  // before the generic success copy below, which assumes a paid, completed
  // registration.
  if (formState._paymentMethod === "bank_transfer") {
    return (
      <div className="space-y-4 text-center py-6">
        <h2 className="text-xl font-semibold text-navy">Thank you, {businessName}.</h2>
        <p className="text-sm text-gray-700">
          Your registration is pending payment confirmation. We will activate your listing within 2 business days of
          receiving your bank transfer.
        </p>
      </div>
    );
  }

  if (!result || !result.success) {
    return (
      <div className="space-y-4">
        <Alert variant="error">
          {result?.error ?? "Something went wrong submitting your registration. Please go back and try again, or contact anthony@synergybcpacific.com."}
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-center py-6">
      <h2 className="text-xl font-semibold text-navy">Thank you, {businessName}.</h2>
      <p className="text-sm text-gray-700">Your registration has been received.</p>
      <p className="text-sm text-gray-700">Our team will verify your listing within 2–3 business days.</p>
      {contactEmail && (
        <p className="text-sm text-gray-700">
          You&apos;ll receive a confirmation email at <span className="font-medium">{contactEmail}</span> when your listing goes live.
        </p>
      )}
      <p className="text-xs text-gray-500">Your $10 registration fee has been received.</p>
    </div>
  );
}
