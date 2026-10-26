"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { ProviderFormSchema, cleanEmptyStrings } from "@/lib/tourism/providerFormSchema";
import type { RegistrationFormState } from "../RegistrationStepper";

export interface Step3ReviewProps {
  formState: RegistrationFormState;
  onEdit: () => void;
  onNext: () => void;
}

const HIDDEN_KEYS = new Set(["_paymentMethod", "_paymentReference", "_referenceId", "_confirmed", "_stripeCancelled"]);

function formatLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function Step3Review({ formState, onEdit, onNext }: Step3ReviewProps) {
  const [confirmed, setConfirmed] = useState(false);

  const validation = useMemo(() => ProviderFormSchema.safeParse(cleanEmptyStrings(formState)), [formState]);

  const entries = Object.entries(formState).filter(([key]) => !HIDDEN_KEYS.has(key));

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-navy">Review your details</h2>

      <dl className="divide-y divide-gray-100 rounded-md border border-gray-200">
        {entries.map(([key, value]) => (
          <div key={key} className="flex justify-between gap-4 px-4 py-2 text-sm">
            <dt className="text-gray-500">{formatLabel(key)}</dt>
            <dd className="text-right text-gray-900 break-words">{formatValue(value)}</dd>
          </div>
        ))}
      </dl>

      {!validation.success && (
        <Alert variant="warning" className="text-xs">
          <p className="font-medium mb-1">Please fix the following before continuing:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {validation.error.issues.slice(0, 8).map((issue, i) => (
              <li key={i}>
                {issue.path.join(".")}: {issue.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
        <span>I confirm the above information is accurate and I am authorised to list this business.</span>
      </label>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button type="button" onClick={onNext} disabled={!confirmed || !validation.success}>
          Next — Payment
        </Button>
      </div>
    </div>
  );
}
