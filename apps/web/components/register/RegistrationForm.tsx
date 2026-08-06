"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { registerProvider } from "@/actions/onboarding/register";
import { verifyDomain } from "@/actions/onboarding/verify-domain";
import { loadLocalState, saveLocalState, defaultState, type OnboardingState } from "@/lib/onboarding/state";
import { registrationSchema } from "@/lib/onboarding/validation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { DomainChecker, type DomainStatus } from "./DomainChecker";
import { SaveIndicator, type SaveStatus } from "@/components/onboarding/SaveIndicator";
import { StepNav } from "@/components/onboarding/StepNav";
import { ResumeOtp } from "@/components/onboarding/ResumeOtp";

type RegistrationForm = OnboardingState["registration"];

const INSTITUTION_TYPE_VALUES = ["university", "government", "ngo", "intergovernmental", "private", "cultural"] as const;

const PACIFIC_COUNTRIES = [
  "Samoa", "Fiji", "Tonga", "Vanuatu", "Papua New Guinea",
  "Solomon Islands", "Kiribati", "Tuvalu", "Nauru", "Palau",
  "Marshall Islands", "Micronesia", "Cook Islands", "Niue",
  "New Caledonia", "French Polynesia", "Wallis and Futuna",
  "Timor-Leste", "Australia", "New Zealand", "Other",
];

export function RegistrationForm() {
  const t = useTranslations("Onboarding.Register");
  const tTypes = useTranslations("Onboarding.Register.institutionTypes");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [domainStatus, setDomainStatus] = useState<DomainStatus>("unchecked");

  const [form, setForm] = useState<RegistrationForm>(() => loadLocalState()?.registration ?? defaultState().registration);

  const updateField = useCallback(<K extends keyof RegistrationForm>(field: K, value: RegistrationForm[K]) => {
    setSaveStatus("saving");
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      const state = loadLocalState() ?? defaultState();
      saveLocalState({ ...state, registration: updated });
      return updated;
    });
    setTimeout(() => setSaveStatus("saved"), 500);
  }, []);

  // Debounced domain verification whenever the website URL changes.
  useEffect(() => {
    let cancelled = false;
    let domain: string;
    try {
      domain = new URL(form.officialWebsite).hostname;
      if (!domain || domain.length < 4) return;
    } catch {
      return; // not a valid URL yet — nothing to check
    }

    setDomainStatus("checking");
    const timeout = setTimeout(() => {
      verifyDomain(domain).then((result) => {
        if (cancelled) return;
        setDomainStatus(result.verified ? "verified" : "manual");
        updateField("domainVerified", result.verified);
      });
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.officialWebsite]);

  const parsedForm = registrationSchema.safeParse(form);
  const canSubmit = parsedForm.success;

  // R5: a disabled Continue button must never be unexplained. Session 9
  // added no new required fields to this form (institution_id,
  // onboarding_session_token, faculty_name etc. are all set server-side in
  // register.ts, never required client input) — but any silent zod failure
  // here (whitespace, a bad enum value, a malformed URL) previously left the
  // button disabled with zero visible reason. Gated on hasAnyInput so a
  // fresh, empty form doesn't greet the user with a wall of errors.
  const hasAnyInput = Boolean(
    form.institutionName || form.institutionType || form.country || form.contactName || form.contactEmail || form.officialWebsite,
  );
  const validationIssues = parsedForm.success ? [] : Array.from(new Set(parsedForm.error.issues.map((issue) => issue.message)));

  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  // R5/Deliverable 5a: once we know this email is already registered, the
  // two paths ("resume your account" vs "this wasn't you, register
  // something else") need to be visually distinct, not a form the provider
  // has to guess whether to keep editing. Starts collapsed — expanding is
  // the deliberate "not you" action, not the default.
  const [formExpanded, setFormExpanded] = useState(false);
  const formCollapsed = alreadyRegistered && !formExpanded;

  const handleSubmit = () => {
    setError(null);
    setAlreadyRegistered(false);
    if (!parsedForm.success) return;
    startTransition(async () => {
      const result = await registerProvider(parsedForm.data);
      if (result.success && result.providerId && result.sessionToken) {
        const state = loadLocalState() ?? defaultState();
        saveLocalState({ ...state, providerId: result.providerId, sessionToken: result.sessionToken, registration: form, currentStep: "wallet" });
        router.push("/onboarding/wallet");
      } else {
        setAlreadyRegistered(Boolean(result.alreadyRegistered));
        setError(result.error ?? t("genericError"));
      }
    });
  };

  return (
    <form
      className="mt-6 space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <SaveIndicator status={saveStatus} />

      {alreadyRegistered && (
        <div>
          <h2 className="text-lg font-semibold text-navy">{t("welcomeBack.heading")}</h2>
          <p className="mt-1 text-base text-gray-600">{t("welcomeBack.body")}</p>
          <ResumeOtp defaultEmail={form.contactEmail || undefined} autoOpen variant="footer" />
          {!formExpanded && (
            <button type="button" onClick={() => setFormExpanded(true)} className="mt-3 text-xs text-gray-500 hover:underline">
              {t("welcomeBack.notYou")}
            </button>
          )}
        </div>
      )}

      {formCollapsed ? null : (
        <>
          <div>
        <label htmlFor="institutionName" className="form-label block text-gray-700">
          {t("fields.institution_name")}
        </label>
        <Input
          id="institutionName"
          value={form.institutionName}
          onChange={(e) => updateField("institutionName", e.target.value)}
          placeholder={t("placeholders.institution_name")}
          required
        />
      </div>

      <div>
        <label htmlFor="institutionType" className="form-label block text-gray-700">
          {t("fields.institution_type")}
        </label>
        <Select
          id="institutionType"
          value={form.institutionType}
          onChange={(e) => updateField("institutionType", e.target.value as RegistrationForm["institutionType"])}
          options={INSTITUTION_TYPE_VALUES.map((value) => ({ value, label: tTypes(value) }))}
          placeholder={t("placeholders.institution_type")}
          required
        />
      </div>

      <div>
        <label htmlFor="country" className="form-label block text-gray-700">
          {t("fields.country")}
        </label>
        <Select
          id="country"
          value={form.country}
          onChange={(e) => updateField("country", e.target.value)}
          options={PACIFIC_COUNTRIES.map((c) => ({ value: c, label: c }))}
          placeholder={t("placeholders.country")}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contactName" className="form-label block text-gray-700">
            {t("fields.contact_name")}
          </label>
          <Input
            id="contactName"
            value={form.contactName}
            onChange={(e) => updateField("contactName", e.target.value)}
            placeholder={t("placeholders.contact_name")}
            required
          />
        </div>
        <div>
          <label htmlFor="contactEmail" className="form-label block text-gray-700">
            {t("fields.contact_email")}
          </label>
          <Input
            id="contactEmail"
            type="email"
            value={form.contactEmail}
            onChange={(e) => updateField("contactEmail", e.target.value)}
            placeholder={t("placeholders.contact_email")}
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor="officialWebsite" className="form-label block text-gray-700">
          {t("fields.official_website")}
        </label>
        <Input
          id="officialWebsite"
          type="url"
          value={form.officialWebsite}
          onChange={(e) => updateField("officialWebsite", e.target.value)}
          placeholder={t("placeholders.official_website")}
          required
        />
        <DomainChecker status={domainStatus} />
      </div>

          <Alert variant="warning">{t("pilot_terms")}</Alert>

          {!canSubmit && hasAnyInput && !error && (
            <Alert variant="warning">
              <p className="font-medium">{t("validationSummaryTitle")}</p>
              <ul className="mt-1 list-disc pl-4">
                {validationIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Alert>
          )}

          {error && !alreadyRegistered && <Alert variant="error">{error}</Alert>}

          <StepNav nextType="submit" nextDisabled={!canSubmit} nextLabel={t("continue")} isSubmitting={isPending} submittingLabel={t("submitting")} />
        </>
      )}

      {!alreadyRegistered && <ResumeOtp defaultEmail={form.contactEmail || undefined} variant="footer" />}
    </form>
  );
}
