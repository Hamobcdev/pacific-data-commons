"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { requestResume } from "@/actions/onboarding/request-resume";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface ResumeLinkProps {
  /** Pre-fills the email field when we already know it (e.g. after Step 1). */
  defaultEmail?: string;
  /** Opens the form automatically — used when registration reports the
   * email is already registered (C1 fix path), so the provider lands
   * directly on the secure resume flow instead of a dead end. */
  autoOpen?: boolean;
  /** "footer" (default) is the original two-piece "Need to continue later? /
   * Send me a link to resume" prompt shown below the registration form.
   * "top" is a single, prominent "Already registered? Continue here" link
   * meant to sit above the form — same underlying flow (opens the same
   * email input, same requestResume() call), just a different entry point
   * so a returning provider never has to fill in, or even see, the form to
   * get back to their account. */
  variant?: "footer" | "top";
}

/** R4: "Send me a link to continue later" — resumable from any device via
 * Supabase Auth magic link (see lib/onboarding/resume.ts). */
export function ResumeLink({ defaultEmail, autoOpen, variant = "footer" }: ResumeLinkProps) {
  const t = useTranslations("Onboarding.resume");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!open) {
    if (variant === "top") {
      return (
        <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-ocean hover:underline">
          {t("alreadyRegistered")}
        </button>
      );
    }
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
