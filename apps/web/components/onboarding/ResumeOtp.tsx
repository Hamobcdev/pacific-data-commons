"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { sendOtp } from "@/actions/onboarding/send-otp";
import { verifyOtp } from "@/actions/onboarding/verify-otp";
import { loadLocalState, saveLocalState, defaultState } from "@/lib/onboarding/state";
import { STEP_ROUTES } from "@/lib/onboarding/step-routes";
import { SESSION_EXPIRED_FLASH_KEY } from "@/lib/onboarding/session-constants";
import { sanitizeOtpInput, isValidOtpLength, isCodeExpired, OTP_CODE_MAX_LENGTH, OTP_CODE_TTL_SECONDS } from "@/lib/onboarding/otp-code";
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

const RESEND_COOLDOWN_SECONDS = 60;
/** Hotfix (2026-08-05): pasting a full code auto-submits, but only after
 * this debounce — long enough for the provider to see what was pasted
 * before it fires, per the hotfix brief's explicit requirement. Manually
 * typing never auto-submits at all (see the diagnosis comment on
 * `code`'s onChange below) — that was the root cause being fixed here. */
const PASTE_AUTOSUBMIT_DEBOUNCE_MS = 500;

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** R4/Decision-9-adjacent: "Already registered? Continue where you left off"
 * — resumable from any device via an OTP code (Session 10; replaces the
 * magic-link version of this component, ResumeLink.tsx). Two stages on one
 * page: email entry, then code entry — the provider never leaves the page.
 *
 * Hotfix (2026-08-05), diagnosis: the original version of this component
 * rendered exactly 6 digit boxes and auto-submitted the moment the 6th box
 * filled. Live testing showed Supabase actually emailing 7- and 8-digit
 * codes for this project — every real code got silently truncated to its
 * first 6 digits and submitted before the provider finished typing it,
 * which Supabase then correctly rejected. That rejection, combined with a
 * separate bug in lib/onboarding/resume.ts's error classification (see that
 * file), surfaced as an immediate, misleading "Code expired" message.
 * Fixed by switching to a single free-form input that accepts 6-8 digits
 * and only ever submits on an explicit Verify press (or a debounced
 * auto-submit after a complete paste — never while the provider is still
 * typing, since typing gives no reliable signal that entry is complete
 * when the target length itself is variable).
 */
export function ResumeOtp({ defaultEmail, autoOpen, variant = "footer" }: ResumeOtpProps) {
  const t = useTranslations("Onboarding.resume");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [code, setCode] = useState("");
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

  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const pasteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (pasteTimeoutRef.current) clearTimeout(pasteTimeoutRef.current);
    };
  }, []);

  // Single ticking clock, only running while there's something to count
  // down (code expiry or a cooldown) — avoids a background interval when
  // nothing on screen depends on it.
  useEffect(() => {
    if (!codeExpiresAt && !resendAvailableAt && !rateLimitedUntil) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [codeExpiresAt, resendAvailableAt, rateLimitedUntil]);

  useEffect(() => {
    if (isCodeExpired(codeExpiresAt, now)) {
      // This is OUR OWN tracked window reaching zero — a distinct, reliable
      // signal from the ambiguous one Supabase's verify response gives
      // (see verifyResumeOtp's diagnosis comment). Bounce back to Stage 1
      // with a clear explanation, code cleared, email kept so "request a
      // new code" is one click.
      setStage("email");
      setCode("");
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
    if (pasteTimeoutRef.current) clearTimeout(pasteTimeoutRef.current);
    startSend(async () => {
      const result = await sendOtp(email);
      if (result.success) {
        setStage("code");
        setCode("");
        setCodeExpiresAt(Date.now() + OTP_CODE_TTL_SECONDS * 1000);
        setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
        setRateLimitedUntil(null);
        requestAnimationFrame(() => codeInputRef.current?.focus());
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

  const submitCode = (value: string) => {
    if (!isValidOtpLength(value)) return;
    setVerifyError(null);
    startVerify(async () => {
      const result = await verifyOtp(email, value);
      if (result.success) {
        setVerified(true);
        routeAfterVerify(result);
        return;
      }

      // Hotfix (2026-08-05): Supabase's verify response can't reliably
      // distinguish "wrong code" from "genuinely expired" (see
      // verifyResumeOtp's diagnosis comment) — so unlike the previous
      // version, there is no longer a separate "reset to Stage 1" branch
      // here for a server-reported expiry. Stay on Stage 2, clear the
      // input, show the (now honestly combined) message, let the provider
      // either retype or hit Resend right there. Only OUR OWN tracked
      // countdown reaching zero (the effect above) sends them back to
      // Stage 1 — that's a signal we actually trust.
      setCode("");
      setVerifyError(result.message ?? t("errorGeneric"));
      requestAnimationFrame(() => codeInputRef.current?.focus());
    });
  };

  // Hotfix (2026-08-05) diagnosis: the previous 6-box UI auto-submitted the
  // instant the 6th digit was typed, on the assumption every code was
  // exactly 6 digits. That assumption was wrong (Supabase sent 7-8 digit
  // codes here), so manual typing must NEVER auto-submit — there is no way
  // to know, mid-keystroke, whether entry is "done" when the target length
  // itself varies. The provider explicitly presses Verify instead.
  const handleCodeChange = (raw: string) => {
    if (pasteTimeoutRef.current) {
      clearTimeout(pasteTimeoutRef.current);
      pasteTimeoutRef.current = null;
    }
    setVerifyError(null);
    setCode(sanitizeOtpInput(raw));
  };

  // A paste is a single, atomic "the provider copied the whole code from
  // their email" event — unlike incremental typing, a complete paste is a
  // trustworthy "entry is done" signal, so auto-submitting after a short
  // debounce (so the provider can see what landed) is safe here in a way
  // it wasn't for keystroke-by-keystroke typing.
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const sanitized = sanitizeOtpInput(e.clipboardData.getData("text"));
    if (!sanitized) return;
    e.preventDefault();
    setVerifyError(null);
    setCode(sanitized);
    if (pasteTimeoutRef.current) clearTimeout(pasteTimeoutRef.current);
    if (isValidOtpLength(sanitized)) {
      pasteTimeoutRef.current = setTimeout(() => submitCode(sanitized), PASTE_AUTOSUBMIT_DEBOUNCE_MS);
    }
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

          <div>
            <label htmlFor="resume-code" className="sr-only">
              {t("codeLabel")}
            </label>
            <Input
              id="resume-code"
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              pattern="\d*"
              maxLength={OTP_CODE_MAX_LENGTH}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              onPaste={handlePaste}
              onFocus={(e) => e.target.select()}
              aria-label={t("codeLabel")}
              disabled={verifyPending}
              className="h-16 min-h-[44px] text-center text-3xl font-semibold tracking-[0.3em]"
            />
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

          <Button type="button" className="w-full min-h-[44px]" disabled={verifyPending || !isValidOtpLength(code)} onClick={() => submitCode(code)}>
            {verifyPending ? t("verifying") : t("verify")}
          </Button>
        </div>
      )}
    </div>
  );
}
