"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { StepNav } from "@/components/onboarding/StepNav";
import { cn } from "@/lib/cn";
import { declareUpdate } from "@/actions/dashboard/declare-update";
import { confirmUpdate } from "@/actions/dashboard/confirm-update";
import type { UpdateCategory } from "@pdc/shared-types";

type DeclarableCategory = Exclude<UpdateCategory, "initial_certification">;

const CATEGORIES: DeclarableCategory[] = ["additive", "correction", "expansion", "methodology_change"];
const CATEGORY_ICON: Record<DeclarableCategory, string> = { additive: "➕", correction: "✏️", expansion: "📊", methodology_change: "🔬" };
const RECERTIFICATION_CATEGORIES: DeclarableCategory[] = ["expansion", "methodology_change"];

const PENDING_WINDOW_DAYS = 7;

export interface PendingUpdate {
  versionId: string;
  versionNumber: number;
  pendingSince: string;
}

export interface DeclareUpdateWizardProps {
  endpointId: string;
  endpointTitle: string;
  institutionName: string;
  notifiedCount: number;
  /** Present when the endpoint is already mid-update on page load — skips
   * straight to Step 4 instead of restarting the declaration wizard. */
  pending: PendingUpdate | null;
}

interface FormState {
  category: DeclarableCategory | null;
  changeDescription: string;
  recordsAdded: string;
  recordsModified: string;
  recordsRemoved: string;
  newParameters: string[];
  newParameterDraft: string;
  dateRangeExtended: boolean;
}

const EMPTY_FORM: FormState = {
  category: null,
  changeDescription: "",
  recordsAdded: "",
  recordsModified: "",
  recordsRemoved: "",
  newParameters: [],
  newParameterDraft: "",
  dateRangeExtended: false,
};

function timeRemaining(pendingSince: string): string {
  const deadline = new Date(pendingSince).getTime() + PENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const ms = deadline - Date.now();
  if (ms <= 0) return "overdue";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return `${days} day${days === 1 ? "" : "s"} ${hours} hour${hours === 1 ? "" : "s"}`;
}

export function DeclareUpdateWizard({ endpointId, endpointTitle, institutionName, notifiedCount, pending }: DeclareUpdateWizardProps) {
  const t = useTranslations("DeclareUpdate");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(pending ? 4 : 1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmChecks, setConfirmChecks] = useState({ authority: false, accurate: false, understand: false, timeframe: false });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [declared, setDeclared] = useState<PendingUpdate | null>(pending);

  // Step 4's confirm-hash sub-form
  const [newHash, setNewHash] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const recertRequired = form.category ? RECERTIFICATION_CATEGORIES.includes(form.category) : false;
  const descriptionLength = form.changeDescription.trim().length;
  const canGoToStep3 = descriptionLength >= 20 && descriptionLength <= 500;
  const allChecksConfirmed = Object.values(confirmChecks).every(Boolean);

  const remaining = useMemo(() => (declared ? timeRemaining(declared.pendingSince) : null), [declared]);

  function addParameter() {
    const value = form.newParameterDraft.trim();
    if (!value) return;
    setForm((f) => ({ ...f, newParameters: [...f.newParameters, value], newParameterDraft: "" }));
  }

  function removeParameter(index: number) {
    setForm((f) => ({ ...f, newParameters: f.newParameters.filter((_, i) => i !== index) }));
  }

  function handleDeclare() {
    const category = form.category;
    if (!category) return;
    setError(null);
    startTransition(async () => {
      const result = await declareUpdate(endpointId, {
        updateCategory: category,
        changeDescription: form.changeDescription.trim(),
        recordsAdded: form.recordsAdded ? Number(form.recordsAdded) : undefined,
        recordsModified: form.recordsModified ? Number(form.recordsModified) : undefined,
        recordsRemoved: form.recordsRemoved ? Number(form.recordsRemoved) : undefined,
        newParameters: form.newParameters,
        dateRangeExtended: form.dateRangeExtended,
      });
      if (!result.success || !result.versionId || !result.versionNumber) {
        setError(result.error ?? t("declareFailed"));
        return;
      }
      setDeclared({ versionId: result.versionId, versionNumber: result.versionNumber, pendingSince: new Date().toISOString() });
      setStep(4);
    });
  }

  function handleConfirm() {
    if (!declared) return;
    setConfirmError(null);
    startTransition(async () => {
      const result = await confirmUpdate(endpointId, declared.versionId, { newHash: newHash.trim() });
      if (!result.success) {
        setConfirmError(result.error ?? t("confirmFailed"));
        return;
      }
      setConfirmed(true);
    });
  }

  if (confirmed && declared) {
    return (
      <Alert variant="success">
        <p className="font-medium">{t("completeTitle", { version: declared.versionNumber })}</p>
        <p className="mt-1">{t("completeBody")}</p>
        <Link href={`/dashboard/endpoints/${endpointId}/versions`} className="mt-3 inline-block text-sm font-medium underline">
          {t("viewVersionHistory")}
        </Link>
      </Alert>
    );
  }

  if (step === 4 && declared) {
    return (
      <div className="space-y-4">
        <Alert variant="success">
          <p className="font-medium">{t("step4.declaredTitle", { version: declared.versionNumber })}</p>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>{t("step4.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>{t("step4.queriesUnaffected")}</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>{t("step4.instruction1")}</li>
              <li>{t("step4.instruction2")}</li>
              <li>{t("step4.instruction3")}</li>
            </ol>

            <div className="rounded-md bg-light-bg p-3 text-sm text-navy">
              {t("timeRemaining")}: <span className="font-medium">{remaining}</span>
            </div>

            <div className="pt-2">
              <label htmlFor="new-hash" className="block text-xs font-medium text-gray-500">
                {t("step4.hashLabel")}
              </label>
              <Input
                id="new-hash"
                value={newHash}
                onChange={(e) => setNewHash(e.target.value)}
                placeholder="64-character hex SHA-256"
                invalid={!!confirmError}
              />
              <p className="mt-1 text-xs text-gray-500">{t("step4.hashHelp")}</p>

              {confirmError && (
                <Alert variant="error" className="mt-3">
                  {confirmError}
                </Alert>
              )}

              <Button
                type="button"
                className="mt-3 w-full"
                disabled={isPending || !/^[0-9a-f]{64}$/i.test(newHash.trim())}
                onClick={handleConfirm}
              >
                {isPending ? t("step4.submitting") : t("step4.submit")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("step1.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, category }))}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    form.category === category ? "border-ocean bg-light-bg ring-2 ring-ocean" : "border-gray-200 hover:border-ocean/50",
                  )}
                >
                  <p className="font-medium text-navy">
                    {CATEGORY_ICON[category]} {t(`categories.${category}.name`)}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">{t(`categories.${category}.definition`)}</p>
                  <Badge variant={RECERTIFICATION_CATEGORIES.includes(category) ? "warning" : "success"} className="mt-2">
                    {t(`categories.${category}.recert`)}
                  </Badge>
                  <p className="mt-2 text-xs text-gray-500">{t(`categories.${category}.example`)}</p>
                </button>
              ))}
            </div>
            <StepNav onNext={() => setStep(2)} nextDisabled={!form.category} nextLabel={t("nav.continue")} />
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("step2.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="change-description" className="block text-xs font-medium text-gray-500">
                {t("step2.descriptionLabel")}
              </label>
              <Textarea
                id="change-description"
                value={form.changeDescription}
                onChange={(e) => setForm((f) => ({ ...f, changeDescription: e.target.value }))}
                maxLength={500}
                rows={3}
              />
              <p className="mt-1 text-xs text-gray-500">
                {descriptionLength}/500 — {t("step2.descriptionHelp")}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="records-added" className="block text-xs font-medium text-gray-500">
                  {t("step2.recordsAddedLabel")}
                </label>
                <Input id="records-added" type="number" min={0} value={form.recordsAdded} onChange={(e) => setForm((f) => ({ ...f, recordsAdded: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="records-modified" className="block text-xs font-medium text-gray-500">
                  {t("step2.recordsModifiedLabel")}
                </label>
                <Input
                  id="records-modified"
                  type="number"
                  min={0}
                  value={form.recordsModified}
                  onChange={(e) => setForm((f) => ({ ...f, recordsModified: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="records-removed" className="block text-xs font-medium text-gray-500">
                  {t("step2.recordsRemovedLabel")}
                </label>
                <Input
                  id="records-removed"
                  type="number"
                  min={0}
                  value={form.recordsRemoved}
                  onChange={(e) => setForm((f) => ({ ...f, recordsRemoved: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-gray-500">{t("step2.newParametersLabel")}</span>
              <div className="mt-1 flex gap-2">
                <Input
                  value={form.newParameterDraft}
                  onChange={(e) => setForm((f) => ({ ...f, newParameterDraft: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addParameter();
                    }
                  }}
                  placeholder={t("step2.newParameterPlaceholder")}
                />
                <Button type="button" variant="secondary" onClick={addParameter}>
                  {t("step2.addParameter")}
                </Button>
              </div>
              {form.newParameters.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.newParameters.map((param, index) => (
                    <Badge key={`${param}-${index}`} variant="neutral">
                      {param}{" "}
                      <button type="button" onClick={() => removeParameter(index)} className="ml-1 text-gray-400 hover:text-gray-700">
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <span className="block text-xs font-medium text-gray-500">{t("step2.dateRangeLabel")}</span>
              <div className="mt-1 flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={form.dateRangeExtended} onChange={() => setForm((f) => ({ ...f, dateRangeExtended: true }))} />
                  {t("step2.yes")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={!form.dateRangeExtended} onChange={() => setForm((f) => ({ ...f, dateRangeExtended: false }))} />
                  {t("step2.no")}
                </label>
              </div>
            </div>

            <StepNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!canGoToStep3} nextLabel={t("nav.continue")} />
          </CardContent>
        </Card>
      )}

      {step === 3 && form.category && (
        <Card>
          <CardHeader>
            <CardTitle>{t("step3.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
              <li>{t("step3.summaryQueries")}</li>
              <li>{t("step3.summaryWindow")}</li>
              <li>{t("step3.summaryNotify", { count: notifiedCount })}</li>
              <li>{recertRequired ? t("step3.summaryRecertRequired") : t("step3.summaryAutoCert")}</li>
            </ul>

            <div className="space-y-2 rounded-md border border-gray-200 p-3">
              {(
                [
                  ["authority", t("step3.checkAuthority", { institution: institutionName })],
                  ["accurate", t("step3.checkAccurate")],
                  ["understand", recertRequired ? t("step3.checkUnderstandRecert") : t("step3.checkUnderstandAuto")],
                  ["timeframe", t("step3.checkTimeframe")],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={confirmChecks[key]}
                    onChange={(e) => setConfirmChecks((c) => ({ ...c, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>

            {error && (
              <Alert variant="error">
                {error}
              </Alert>
            )}

            <StepNav
              onBack={() => setStep(2)}
              onNext={handleDeclare}
              nextDisabled={!allChecksConfirmed}
              isSubmitting={isPending}
              nextLabel={t("step3.declare")}
              submittingLabel={t("step3.declaring")}
            />
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-gray-400">{endpointTitle}</p>
    </div>
  );
}
