"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { saveReview, getReviewContext, type OriginalUploadSummary } from "@/actions/onboarding/save-review";
import { loadLocalState, saveLocalState, defaultState, type ReviewState } from "@/lib/onboarding/state";
import { reviewSchema } from "@/lib/onboarding/validation";
import { DEFAULT_REVIEW_PRICING } from "@/lib/onboarding/tiers";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StepNav } from "@/components/onboarding/StepNav";
import { OriginalSummaryPanel } from "./OriginalSummaryPanel";
import { StructuredOutputPanel } from "./StructuredOutputPanel";
import { SensitivityConfirmation } from "./SensitivityConfirmation";

export function ReviewLayout() {
  const t = useTranslations("Onboarding.Review");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  // Same fix as WalletForm (Session 9 follow-up) — see that component's
  // comment. Distinct from loadingContext below, which governs
  // OriginalSummaryPanel's own in-place loading state once a session is
  // already confirmed present.
  const [status, setStatus] = useState<"checking" | "redirecting" | "ready">("checking");
  const [verifiedGovernment, setVerifiedGovernment] = useState(false);
  const [loadingContext, setLoadingContext] = useState(true);
  const [uploads, setUploads] = useState<OriginalUploadSummary[]>([]);
  const [form, setForm] = useState<ReviewState>(() => {
    const loaded = loadLocalState()?.review ?? defaultState().review;
    return loaded.pricing.length > 0 ? loaded : { ...loaded, pricing: DEFAULT_REVIEW_PRICING };
  });

  useEffect(() => {
    const state = loadLocalState();
    if (!state?.providerId || !state.sessionToken) {
      setStatus("redirecting");
      router.replace("/onboarding/register");
      return;
    }
    setProviderId(state.providerId);
    setSessionToken(state.sessionToken);
    setStatus("ready");

    getReviewContext(state.providerId, state.sessionToken).then((context) => {
      setUploads(context.uploads);
      setVerifiedGovernment(context.verifiedGovernment);
      setLoadingContext(false);

      // Only pre-fill from the AI-suggested baseline the first time this
      // step is visited — never clobber a provider's own in-progress edits
      // on a page refresh (R3/R4).
      const hasExistingEdits = Boolean(state.review.title || state.review.description);
      if (context.suggested && !hasExistingEdits) {
        persist({
          ...form,
          title: context.suggested.title,
          description: context.suggested.description,
          category: context.suggested.category as ReviewState["category"],
          subCategory: context.suggested.subCategory,
          geography: context.suggested.geography,
          timePeriodStart: context.suggested.timePeriodStart,
          timePeriodEnd: context.suggested.timePeriodEnd,
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const persist = (updated: ReviewState) => {
    setForm(updated);
    const state = loadLocalState() ?? defaultState();
    saveLocalState({ ...state, review: updated });
  };

  const updateField = <K extends keyof ReviewState>(field: K, value: ReviewState[K]) => {
    persist({ ...form, [field]: value });
  };

  const handleAcceptAll = () => {
    persist({
      ...form,
      pricing: form.pricing.map((row) => ({ ...row, overridePriceUsdc: row.aiSuggestedPriceUsdc.toFixed(2) })),
    });
  };

  const allSensitivityConfirmed = Object.values(form.sensitivity).every(Boolean);
  const parsedForm = reviewSchema.safeParse(form);
  const canSubmit = parsedForm.success && allSensitivityConfirmed;

  const handleSubmit = () => {
    if (!providerId || !sessionToken || !parsedForm.success) return;
    setError(null);
    startTransition(async () => {
      const result = await saveReview(providerId, sessionToken, parsedForm.data);
      if (result.success && result.nextStep) {
        const state = loadLocalState() ?? defaultState();
        saveLocalState({ ...state, currentStep: "provenance" });
        router.push(result.nextStep);
      } else {
        setError(result.error ?? t("genericError"));
      }
    });
  };

  if (status === "checking") {
    return <p className="mt-6 text-sm text-gray-500">{t("loading")}</p>;
  }

  if (status === "redirecting" || !providerId || !sessionToken) {
    return <p className="mt-6 text-sm text-gray-500">{t("redirecting")}</p>;
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-600">{t("subtitle")}</p>
        <Button type="button" variant="secondary" onClick={handleAcceptAll} className="shrink-0">
          {t("acceptAll")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <OriginalSummaryPanel uploads={uploads} loading={loadingContext} />
        <StructuredOutputPanel value={form} onChange={updateField} verifiedGovernment={verifiedGovernment} />
      </div>

      <SensitivityConfirmation value={form.sensitivity} onChange={(field, checked) => updateField("sensitivity", { ...form.sensitivity, [field]: checked })} />

      {error && <Alert variant="error">{error}</Alert>}

      <StepNav
        onBack={() => router.push("/onboarding/upload")}
        onNext={handleSubmit}
        nextDisabled={!canSubmit}
        nextLabel={t("continue")}
        isSubmitting={isPending}
      />
    </div>
  );
}
