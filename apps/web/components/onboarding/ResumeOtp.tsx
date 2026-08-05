"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { sendOtp } from "@/actions/onboarding/send-otp";
import { verifyOtp } from "@/actions/onboarding/verify-otp";
import { loadLocalState, saveLocalState, defaultState } from "@/lib/onboarding/state";
import { STEP_ROUTES } from "@/lib/onboarding/step-routes";
import { SESSION_EXPIRED_FLASH_KEY } from "@/lib/onboarding/session-constants";
import { parsePastedCode, OTP_CODE_LENGTH } from "@/lib/onboarding/otp-code";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export interface ResumeOtpProps {
  /** Pre-fills the email field when we already know it (e.g. after Step 1). */
  defaultEmail?: string;
  /** Opens the form automatically — used when registration reports the
   * email is already registered (C1 fix path), or when a step form detects
   * an expired onboarding session (Session 10, Deliverable 2), so the
   * provider lands directly on the resume flow instead of a dead end. */
  autoOpen?: boolean;
  /** "footer" (default) is the original two-piece "Need to continue later? /
   * Send me a code to resume" prompt shown below the registration form.
   * "top" is a single, prominent "Already registered? Continue here" link
   * meant to sit above the form. */
  variant?: "footer" | "top";
}

const CODE_TTL_SECONDS = 10 * 60; // Supabase Auth OTP default expiry
const RESEND_COOLDOWN_SECONDS = 60;

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** R4/Decision-9-adjacent: "Already registered? Continue where you left off"
 * — resumable from any device via a 6-digit OTP code (Session 10; replaces
 * the magic-link version of this component, ResumeLink.tsx). Two stages on
 * one page: email entry, then code entry — the provider never leaves the
 * page. */
export function ResumeOtp({ defaultEmail, autoOpen, variant = "footer" }: ResumeOtpProps) {
  const t = useTranslations("Onboarding.resume");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [digits, setDigits] = useState<string[]>(Array(OTP_CODE_LENGTH).fill(""));
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  const [sendPending, startSend] = useTransition();
  const [verifyPending, startVerify] = useTransition();
  const [sendError, setSendError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // A session-expired step form (Deliverable 2) leaves a flash message in
  // localStorage before redirecting here — surface it once, then clear it,
  // same "read once and clear" pattern as everything else this component
  // reads from localStorage.
  useEffect(() => {
    const message = typeof window !== "undefined" ? window.localStorage.getItem(SESSION_EXPIRED_FLASH_KEY) : null;
    if (message) {
      setFlashMessage(message);
      window.localStorage.removeItem(SESSION_EXPIRED_FLASH_KEY);
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  // Single ticking clock, only running while there's something to count
  // down (code expiry or a cooldown) — avoids a background interval when
  // nothing on screen depends on it.
  useEffect(() => {
    if (!codeExpiresAt && !resendAvailableAt && !rateLimitedUntil) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [codeExpiresAt, resendAvailableAt, rateLimitedUntil]);

  useEffect(() => {
    if (codeExpiresAt && now >= codeExpiresAt) {
      // Expired — bounce back to Stage 1 with a clear explanation, code
      // pre-cleared, email kept so "request a new code" is one click.
      setStage("email");
      setDigits(Array(OTP_CODE_LENGTH).fill(""));
      setCodeExpiresAt(null);
      setVerifyError(t("errorExpired"));
    }
  }, [now, codeExpiresAt, t]);

  const secondsUntil = (target: number | null) => (target ? Math.max(0, Math.ceil((target - now) / 1000)) : 0);
  const codeSecondsLeft = secondsUntil(codeExpiresAt);
  const resendSecondsLeft = secondsUntil(resendAvailableAt);
  const rateLimitSecondsLeft = secondsUntil(rateLimitedUntil);
  const sendDisabled = sendPending || rateLimitSecondsLeft > 0 || (stage === "code" && resendSecondsLeft > 0);

  const handleSend = () => {
    setSendError(null);
    setVerifyError(null);
    startSend(async () => {
      const result = await sendOtp(email);
      if (result.success) {
        setStage("code");
        setDigits(Array(OTP_CODE_LENGTH).fill(""));
        setCodeExpiresAt(Date.now() + CODE_TTL_SECONDS * 1000);
        setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
        setRateLimitedUntil(null);
        requestAnimationFrame(() => inputRefs.current[0]?.focus());
      } else {
        setSendError(result.message);
        if (typeof result.resetInSeconds === "number") {
          setRateLimitedUntil(Date.now() + result.resetInSeconds * 1000);
        }
      }
    });
  };

  const routeAfterVerify = (result: Awaited<ReturnType<typeof verifyOtp>>) => {
    if (result.redirectToDashboard) {
      router.replace("/dashboard");
      return;
    }
    if (result.providerId && result.sessionToken && result.nextStep) {
      const state = loadLocalState() ?? defaultState();
      saveLocalState({ ...state, providerId: result.providerId, sessionToken: result.sessionToken, currentStep: result.nextStep });
      router.push(STEP_ROUTES[result.nextStep]);
    }
  };

  const submitCode = (code: string) => {
    if (code.length !== OTP_CODE_LENGTH) return;
    setVerifyError(null);
    startVerify(async () => {
      const result = await verifyOtp(email, code);
      if (result.success) {
        setVerified(true);
        routeAfterVerify(result);
        return;
      }

      if (result.error === "expired") {
        setStage("email");
        setDigits(Array(OTP_CODE_LENGTH).fill(""));
        setCodeExpiresAt(null);
        setVerifyError(result.message ?? t("errorExpired"));
        return;
      }

      // Wrong code or generic failure — clear the boxes, keep email and
      // Stage 2 visible so the provider can immediately retry without
      // re-requesting a code.
      setDigits(Array(OTP_CODE_LENGTH).fill(""));
      setVerifyError(result.message ?? t("errorGeneric"));
      requestAnimationFrame(() => inputRefs.current[0]?.focus());
    });
  };

  const updateDigit = (index: number, value: string) => {
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      const updated = [...digits];
      updated[index] = "";
      setDigits(updated);
      return;
    }
    const updated = [...digits];
    updated[index] = clean[clean.length - 1] ?? "";
    setDigits(updated);
    if (index < OTP_CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    } else {
      submitCode(updated.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < OTP_CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const raw = e.clipboardData.getData("text");
    const digitsOnly = raw.replace(/\D/g, "");
    if (!digitsOnly) return;
    e.preventDefault();
    const updated = parsePastedCode(raw);
    setDigits(updated);
    const nextEmpty = updated.findIndex((d) => !d);
    const focusIndex = nextEmpty === -1 ? OTP_CODE_LENGTH - 1 : nextEmpty;
    inputRefs.current[focusIndex]?.focus();
    if (updated.every((d) => d)) submitCode(updated.join(""));
  };

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

  if (verified) {
    return (
      <Alert variant="success">
        <p className="font-medium">{t("success")}</p>
      </Alert>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      {flashMessage && (
        <Alert variant="info" className="mb-4">
          {flashMessage}
        </Alert>
      )}

      {variant === "top" && <p className="mb-3 text-sm font-medium text-navy">{t("welcomeBack")}</p>}

      {stage === "email" && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex-1">
            <label htmlFor="resume-email" className="sr-only">
              {t("emailLabel")}
            </label>
            <Input
              id="resume-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              aria-label={t("emailLabel")}
              inputMode="email"
            />
            {sendError && (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {sendError}
              </p>
            )}
            {verifyError && !sendError && (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {verifyError}
              </p>
            )}
            {rateLimitSecondsLeft > 0 && (
              <p className="mt-1 text-xs text-gray-500">{t("rateLimited", { time: formatCountdown(rateLimitSecondsLeft) })}</p>
            )}
          </div>
          <Button type="button" variant="secondary" disabled={sendDisabled || !email} onClick={handleSend} className="min-h-[44px] shrink-0">
            {sendPending ? t("sending") : t("sendCode")}
          </Button>
        </div>
      )}

      {stage === "code" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{t("codeSentTo", { email })}</p>

          <div className="flex justify-center gap-2" role="group" aria-label={t("codeLabel")}>
            {digits.map((digit, index) => (
              <Input
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={1}
                value={digit}
                onChange={(e) => updateDigit(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                aria-label={t("digitLabel", { position: index + 1 })}
                disabled={verifyPending}
                className="h-11 w-11 min-h-[44px] min-w-[44px] text-center text-lg font-semibold"
              />
            ))}
          </div>

          {verifyError && (
            <p className="text-center text-xs text-red-600" role="alert">
              {verifyError}
            </p>
          )}

          {codeExpiresAt && <p className="text-center text-xs text-gray-500">{t("codeExpiry", { time: formatCountdown(codeSecondsLeft) })}</p>}

          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={handleSend}
              disabled={sendDisabled}
              className="text-xs text-ocean hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
            >
              {resendSecondsLeft > 0 ? t("resendCooldown", { seconds: resendSecondsLeft }) : t("resendAvailable")}
            </button>
          </div>

          <Button
            type="button"
            className="w-full min-h-[44px]"
            disabled={verifyPending || digits.some((d) => !d)}
            onClick={() => submitCode(digits.join(""))}
          >
            {verifyPending ? t("verifying") : t("verify")}
          </Button>
        </div>
      )}
    </div>
  );
}
