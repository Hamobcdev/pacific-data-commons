"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { requestResume } from "@/actions/onboarding/request-resume";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface ResumeLinkProps {
  /** Pre-fills the email field when we already know it (e.g. after Step 1). */
  defaultEmail?: string;
}

/** R4: "Send me a link to continue later" — resumable from any device via
 * Supabase Auth magic link (see lib/onboarding/resume.ts). */
export function ResumeLink({ defaultEmail }: ResumeLinkProps) {
  const t = useTranslations("Onboarding.resume");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-ocean hover:underline">
        {t("prompt")}
        {t("action")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex-1">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          aria-label={t("emailPlaceholder")}
        />
        {result && <p className={result.success ? "mt-1 text-xs text-ocean" : "mt-1 text-xs text-red-600"}>{result.message}</p>}
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={isPending || !email}
        onClick={() => {
          startTransition(async () => {
            const res = await requestResume(email);
            setResult(res);
          });
        }}
      >
        {isPending ? t("sending") : t("send")}
      </Button>
    </div>
  );
}
