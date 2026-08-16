"use client";

import { useTranslations } from "next-intl";
import type { UpdateFrequency } from "@pdc/shared-types";
import type { OnboardingState } from "@/lib/onboarding/state";
import { DATA_CATEGORIES, CULTURAL_SENSITIVITY_LEVELS } from "@/lib/onboarding/validation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";

type UploadFormState = OnboardingState["upload"];

const UPDATE_FREQUENCIES: UpdateFrequency[] = ["real-time", "daily", "monthly", "annual", "static", "irregular"];

export interface DataContextFormProps {
  value: UploadFormState;
  onChange: <K extends keyof UploadFormState>(field: K, value: UploadFormState[K]) => void;
}

/**
 * R7: indigenousDataFlag and culturalSensitivity start `null` (not
 * defaulted to "no"/"none") and render as unselected radios — the provider
 * must actively pick one. sensitivityConfirmed starts false and the
 * checkbox is never pre-checked; both are enforced again server-side by
 * uploadContextSchema, this is just the UI half of that guarantee.
 */
export function DataContextForm({ value, onChange }: DataContextFormProps) {
  const t = useTranslations("Onboarding.Upload");
  const tCategories = useTranslations("Onboarding.Upload.categories");
  const tFrequencies = useTranslations("Onboarding.Upload.frequencies");
  const showCulturalGuidance = value.indigenousDataFlag === true || value.culturalSensitivity === "high";

  return (
    <div className="mt-8 space-y-6">
      <h2 className="text-lg font-semibold text-navy">{t("context.title")}</h2>

      <div>
        <label htmlFor="dataTitle" className="block text-sm font-medium text-gray-700">
          {t("context.data_title")}
        </label>
        <Input id="dataTitle" value={value.dataTitle} onChange={(e) => onChange("dataTitle", e.target.value)} required />
      </div>

      <div>
        <label htmlFor="dataDescription" className="block text-sm font-medium text-gray-700">
          {t("context.description")}
        </label>
        <Textarea id="dataDescription" value={value.dataDescription} onChange={(e) => onChange("dataDescription", e.target.value)} required />
      </div>

      <div>
        <label htmlFor="dataCategory" className="block text-sm font-medium text-gray-700">
          {t("context.category")}
        </label>
        <Select
          id="dataCategory"
          value={value.dataCategory}
          onChange={(e) => onChange("dataCategory", e.target.value as UploadFormState["dataCategory"])}
          options={DATA_CATEGORIES.map((c) => ({ value: c, label: tCategories(c) }))}
          placeholder={t("context.categoryPlaceholder")}
          required
        />
      </div>

      {value.dataCategory === "other" && (
        <div>
          <label htmlFor="dataSubCategory" className="block text-sm font-medium text-gray-700">
            {t("context.otherCategoryLabel")}
          </label>
          <Input
            id="dataSubCategory"
            value={value.dataSubCategory}
            onChange={(e) => onChange("dataSubCategory", e.target.value)}
            placeholder={t("context.otherCategoryPlaceholder")}
            required
          />
          <p className="mt-1 text-xs text-gray-500">{t("context.otherCategoryNote")}</p>
        </div>
      )}

      <div>
        <label htmlFor="geographyRegion" className="block text-sm font-medium text-gray-700">
          {t("context.geography")}
        </label>
        <Input
          id="geographyRegion"
          value={value.geographyRegion}
          onChange={(e) => onChange("geographyRegion", e.target.value)}
          placeholder={t("context.geographyPlaceholder")}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="timePeriodStart" className="block text-sm font-medium text-gray-700">
            {t("context.period_start")}
          </label>
          <Input
            id="timePeriodStart"
            inputMode="numeric"
            value={value.timePeriodStart}
            onChange={(e) => onChange("timePeriodStart", e.target.value)}
            placeholder="2018"
            required
          />
        </div>
        <div>
          <label htmlFor="timePeriodEnd" className="block text-sm font-medium text-gray-700">
            {t("context.period_end")}
          </label>
          <Input
            id="timePeriodEnd"
            inputMode="numeric"
            value={value.timePeriodEnd}
            onChange={(e) => onChange("timePeriodEnd", e.target.value)}
            placeholder="2023"
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor="updateFrequency" className="block text-sm font-medium text-gray-700">
          {t("context.frequency")}
        </label>
        <Select
          id="updateFrequency"
          value={value.updateFrequency}
          onChange={(e) => onChange("updateFrequency", e.target.value as UploadFormState["updateFrequency"])}
          options={UPDATE_FREQUENCIES.map((f) => ({ value: f, label: tFrequencies(f) }))}
          placeholder={t("context.frequencyPlaceholder")}
        />
      </div>

      <div>
        <label htmlFor="methodologySummary" className="block text-sm font-medium text-gray-700">
          {t("context.methodology")}
        </label>
        <Textarea
          id="methodologySummary"
          value={value.methodologySummary}
          onChange={(e) => onChange("methodologySummary", e.target.value)}
          required
        />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-navy">{t("sovereignty.title")}</h3>
        <p className="mt-1 text-xs text-gray-500">{t("sovereignty.subtitle")}</p>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-gray-700">{t("sovereignty.indigenous_question")}</legend>
          <div className="mt-2 flex gap-4">
            <RadioOption
              name="indigenousDataFlag"
              checked={value.indigenousDataFlag === true}
              onChange={() => onChange("indigenousDataFlag", true)}
              label={t("sovereignty.indigenous_yes")}
            />
            <RadioOption
              name="indigenousDataFlag"
              checked={value.indigenousDataFlag === false}
              onChange={() => onChange("indigenousDataFlag", false)}
              label={t("sovereignty.indigenous_no")}
            />
          </div>
        </fieldset>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-gray-700">{t("sovereignty.sensitivity_question")}</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {CULTURAL_SENSITIVITY_LEVELS.map((level) => (
              <RadioOption
                key={level}
                name="culturalSensitivity"
                checked={value.culturalSensitivity === level}
                onChange={() => onChange("culturalSensitivity", level)}
                label={t(`sovereignty.sensitivity_${level}`)}
              />
            ))}
          </div>
        </fieldset>

        {showCulturalGuidance && <Alert variant="info" className="mt-4">{t("sovereignty.cultural_coming_soon")}</Alert>}

        <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={value.sensitivityConfirmed}
            onChange={(e) => onChange("sensitivityConfirmed", e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-ocean focus:ring-ocean"
            required
          />
          {t("sovereignty.confirm_label")}
        </label>
      </div>
    </div>
  );
}

function RadioOption({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-700">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="h-4 w-4 border-gray-300 text-ocean focus:ring-ocean" />
      {label}
    </label>
  );
}
