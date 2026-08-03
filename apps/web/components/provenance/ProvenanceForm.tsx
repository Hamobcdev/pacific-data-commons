"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { saveProvenance } from "@/actions/onboarding/save-provenance";
import { loadLocalState, saveLocalState, defaultState, type ProvenanceState, type ProvenanceResearcher } from "@/lib/onboarding/state";
import { provenanceSchema } from "@/lib/onboarding/validation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StepNav } from "@/components/onboarding/StepNav";
import { OrcidField } from "./OrcidField";
import { DoiField } from "./DoiField";
import { TrustTierExpectation } from "./TrustTierExpectation";

type ProvenanceForm = ProvenanceState;

function newResearcher(): ProvenanceResearcher {
  return { id: crypto.randomUUID(), name: "", orcid: "", orcidStatus: "unchecked", orcidVerifiedName: null };
}

export function ProvenanceForm() {
  const t = useTranslations("Onboarding.Provenance");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [form, setForm] = useState<ProvenanceForm>(() => {
    const loaded = loadLocalState()?.provenance ?? defaultState().provenance;
    return loaded.researchers.length > 0 ? loaded : { ...loaded, researchers: [newResearcher()] };
  });

  useEffect(() => {
    const state = loadLocalState();
    if (!state?.providerId || !state.sessionToken) {
      router.replace("/onboarding/register");
      return;
    }
    setProviderId(state.providerId);
    setSessionToken(state.sessionToken);
  }, [router]);

  const persist = (updated: ProvenanceForm) => {
    setForm(updated);
    const state = loadLocalState() ?? defaultState();
    saveLocalState({ ...state, provenance: updated });
  };

  const updateField = <K extends keyof ProvenanceForm>(field: K, value: ProvenanceForm[K]) => {
    persist({ ...form, [field]: value });
  };

  const updateResearcher = (id: string, patch: Partial<ProvenanceResearcher>) => {
    persist({ ...form, researchers: form.researchers.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  };

  const addResearcher = () => persist({ ...form, researchers: [...form.researchers, newResearcher()] });
  const removeResearcher = (id: string) => persist({ ...form, researchers: form.researchers.filter((r) => r.id !== id) });

  const parsedForm = provenanceSchema.safeParse(form);
  const canSubmit = parsedForm.success;

  const handleSubmit = () => {
    if (!providerId || !sessionToken || !parsedForm.success) return;
    setError(null);
    startTransition(async () => {
      const result = await saveProvenance(providerId, sessionToken, parsedForm.data);
      if (result.success && result.nextStep) {
        const state = loadLocalState() ?? defaultState();
        saveLocalState({ ...state, currentStep: "deploy" });
        router.push(result.nextStep);
      } else {
        setError(result.error ?? t("genericError"));
      }
    });
  };

  if (!providerId || !sessionToken) return null;

  return (
    <div className="mt-6 space-y-6">
      <div>
        <label htmlFor="methodology" className="block text-sm font-medium text-gray-700">
          {t("fields.methodology")}
        </label>
        <p className="mt-1 text-xs text-gray-500">{t("fields.methodologyGuidance")}</p>
        <Textarea id="methodology" rows={5} value={form.methodology} onChange={(e) => updateField("methodology", e.target.value)} required />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-navy">{t("fields.researchers")}</h3>
        <div className="mt-2 space-y-4">
          {form.researchers.map((researcher, index) => (
            <div key={researcher.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`researcher-name-${researcher.id}`} className="text-xs font-medium text-gray-500">
                  {t("fields.researcherName", { index: index + 1 })}
                </label>
                {form.researchers.length > 1 && (
                  <button type="button" onClick={() => removeResearcher(researcher.id)} className="text-xs text-red-600 hover:underline">
                    {t("fields.remove")}
                  </button>
                )}
              </div>
              <Input
                id={`researcher-name-${researcher.id}`}
                value={researcher.name}
                onChange={(e) => updateResearcher(researcher.id, { name: e.target.value })}
                className="mb-2"
              />
              <label className="text-xs font-medium text-gray-500">{t("fields.researcherOrcid")}</label>
              <OrcidField
                value={researcher.orcid}
                status={researcher.orcidStatus}
                verifiedName={researcher.orcidVerifiedName}
                onChange={(orcid) => updateResearcher(researcher.id, { orcid })}
                onResult={(orcidStatus, orcidVerifiedName) => updateResearcher(researcher.id, { orcidStatus, orcidVerifiedName })}
              />
            </div>
          ))}
        </div>
        <Button type="button" variant="ghost" className="mt-2" onClick={addResearcher}>
          {t("fields.addResearcher")}
        </Button>
      </div>

      <DoiField
        value={form.doi}
        status={form.doiStatus}
        verifiedTitle={form.doiVerifiedTitle}
        onChange={(doi) => updateField("doi", doi)}
        onResult={(doiStatus, doiVerifiedTitle) => persist({ ...form, doi: form.doi, doiStatus, doiVerifiedTitle })}
      />

      <div>
        <label htmlFor="peerReviewStatus" className="block text-sm font-medium text-gray-700">
          {t("fields.peerReviewStatus")}
        </label>
        <Select
          id="peerReviewStatus"
          value={form.peerReviewStatus}
          onChange={(e) => updateField("peerReviewStatus", e.target.value as ProvenanceForm["peerReviewStatus"])}
          options={[
            { value: "none", label: t("fields.peerReviewNone") },
            { value: "under-review", label: t("fields.peerReviewUnderReview") },
            { value: "published", label: t("fields.peerReviewPublished") },
          ]}
        />
      </div>

      {form.peerReviewStatus === "published" && (
        <div>
          <label htmlFor="peerReviewVenue" className="block text-sm font-medium text-gray-700">
            {t("fields.peerReviewVenue")}
          </label>
          <Input id="peerReviewVenue" value={form.peerReviewVenue} onChange={(e) => updateField("peerReviewVenue", e.target.value)} />
        </div>
      )}

      <div>
        <label htmlFor="fundingSource" className="block text-sm font-medium text-gray-700">
          {t("fields.fundingSource")}
        </label>
        <Input id="fundingSource" value={form.fundingSource} onChange={(e) => updateField("fundingSource", e.target.value)} />
      </div>

      <div>
        <label htmlFor="knownLimitations" className="block text-sm font-medium text-gray-700">
          {t("fields.knownLimitations")}
        </label>
        <Textarea id="knownLimitations" value={form.knownLimitations} onChange={(e) => updateField("knownLimitations", e.target.value)} />
      </div>

      <TrustTierExpectation doiStatus={form.doiStatus} />

      {error && <Alert variant="error">{error}</Alert>}

      <StepNav
        onBack={() => router.push("/onboarding/review")}
        onNext={handleSubmit}
        nextDisabled={!canSubmit}
        nextLabel={t("continue")}
        isSubmitting={isPending}
      />
    </div>
  );
}
