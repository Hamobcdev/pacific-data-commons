import { describe, expect, it, vi, beforeEach } from "vitest";
import { checkRateLimit } from "../lib/rate-limit";
import { sanitizeOtpInput, isValidOtpLength, isCodeExpired, OTP_CODE_MIN_LENGTH, OTP_CODE_MAX_LENGTH } from "../lib/onboarding/otp-code";

/**
 * Session 10: mocks every real I/O boundary the OTP flow crosses —
 * next/headers (cookies()/headers() both throw outside a Next.js request
 * context, which a plain vitest run always is), the Supabase JS client, and
 * resumeOnboardingSession (mocked wholesale rather than given a fake
 * Supabase client capable of answering its DB queries — that function's own
 * step-detection logic isn't this file's concern, only that verifyResumeOtp
 * delegates to it correctly on success). Everything else — sendResumeOtp,
 * verifyResumeOtp, the verifyOtp server action's validation and rate
 * limiting — runs for real against these mocks.
 *
 * Hotfix (2026-08-05): updated for two bugs found in live testing —
 * Supabase emailing 7-8 digit codes (the app only accepted exactly 6), and
 * a false "Code expired" message caused by Supabase's verify_otp response
 * not actually distinguishing "wrong code" from "genuinely expired" (see
 * lib/onboarding/resume.ts's verifyResumeOtp for the full diagnosis, backed
 * by this project's live Supabase auth logs). No jsdom/component-rendering
 * test infrastructure was added for this hotfix (deliberately, to stay
 * inside "tests only, do not expand scope") — the mount/timer-start claims
 * the hotfix brief asked to cover are instead verified through
 * isCodeExpired(), the pure decision function ResumeOtp.tsx's expiry effect
 * was refactored to call, which covers the same logic without needing to
 * render the component.
 */

const mockSignInWithOtp = vi.fn();
const mockVerifyOtp = vi.fn();
const mockResumeOnboardingSession = vi.fn();

vi.mock("next/headers", () => ({
  headers: () => ({ get: () => null }),
  cookies: () => ({ getAll: () => [], set: () => {} }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithOtp: mockSignInWithOtp } }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({ auth: { verifyOtp: mockVerifyOtp } }),
  createServiceClient: () => ({}),
}));

vi.mock("@/actions/onboarding/resume-session", () => ({
  resumeOnboardingSession: mockResumeOnboardingSession,
}));

// Partial mock: keep the real checkRateLimit implementation (that's what's
// under test), but stub getClientIp to a fresh value per call. Without
// this, every call in this file resolves to the same "unknown" IP (from
// the next/headers mock above returning no forwarded-for/real-ip headers),
// so the per-IP rate limiter — a real, intentional cross-request
// protection in lib/rate-limit.ts — would accumulate across unrelated
// tests in this file and trip on whichever test happens to run 5th,
// regardless of which email each test uses.
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/rate-limit")>();
  return { ...actual, getClientIp: async () => crypto.randomUUID() };
});

describe("otp-code.ts — sanitizeOtpInput / isValidOtpLength", () => {
  it("strips non-digit characters (e.g. 'Your code is: 482913')", () => {
    expect(sanitizeOtpInput("Your code is: 482913")).toBe("482913");
  });

  it("caps at OTP_CODE_MAX_LENGTH (8) — the fixed-length assumption this hotfix removes", () => {
    expect(sanitizeOtpInput("1234567890")).toBe("12345678");
    expect(sanitizeOtpInput("1234567890").length).toBe(OTP_CODE_MAX_LENGTH);
  });

  it("passes through a short, in-progress entry unchanged", () => {
    expect(sanitizeOtpInput("42")).toBe("42");
  });

  it("accepts 6, 7, and 8 digit codes as valid length — the actual bug fix", () => {
    expect(isValidOtpLength("123456")).toBe(true);
    expect(isValidOtpLength("1234567")).toBe(true);
    expect(isValidOtpLength("12345678")).toBe(true);
  });

  it("rejects 5 digits (too short) and 9 digits (too long)", () => {
    expect(isValidOtpLength("12345")).toBe(false);
    expect(isValidOtpLength("123456789")).toBe(false);
  });

  it("OTP_CODE_MIN_LENGTH / OTP_CODE_MAX_LENGTH match the tolerant 6-8 range", () => {
    expect(OTP_CODE_MIN_LENGTH).toBe(6);
    expect(OTP_CODE_MAX_LENGTH).toBe(8);
  });
});

describe("otp-code.ts — isCodeExpired (mount / send-success timing, Deliverable 3)", () => {
  it("is never expired when no code has been sent yet (codeExpiresAt is null on mount)", () => {
    expect(isCodeExpired(null, Date.now())).toBe(false);
  });

  it("is not expired immediately after sendOtp() succeeds (now equals the just-computed expiry start)", () => {
    const now = Date.now();
    const expiresAt = now + 60 * 60 * 1000; // OTP_CODE_TTL_SECONDS from the moment send succeeds
    expect(isCodeExpired(expiresAt, now)).toBe(false);
  });

  it("is not expired partway through the window", () => {
    const now = Date.now();
    expect(isCodeExpired(now + 1000, now)).toBe(false);
  });

  it("is expired once `now` reaches or passes the expiry timestamp", () => {
    const now = Date.now();
    expect(isCodeExpired(now, now)).toBe(true);
    expect(isCodeExpired(now - 1, now)).toBe(true);
  });
});

describe("checkRateLimit — resetInSeconds (Deliverable 3, Session 10)", () => {
  it("reports the countdown to the window closing even while still allowed", () => {
    const identifier = `test-reset:${crypto.randomUUID()}`;
    const result = checkRateLimit({ identifier, maxRequests: 5, windowMs: 60_000 });
    expect(result.allowed).toBe(true);
    expect(result.resetInSeconds).toBeGreaterThan(0);
    expect(result.resetInSeconds).toBeLessThanOrEqual(60);
  });

  it("reports a positive countdown, bounded by the window, once blocked", () => {
    const identifier = `test-reset:${crypto.randomUUID()}`;
    for (let i = 0; i < 5; i++) checkRateLimit({ identifier, maxRequests: 5, windowMs: 60_000 });
    const result = checkRateLimit({ identifier, maxRequests: 5, windowMs: 60_000 });
    expect(result.allowed).toBe(false);
    expect(result.resetInSeconds).toBeGreaterThan(0);
    expect(result.resetInSeconds).toBeLessThanOrEqual(60);
  });
});

describe("checkRateLimit — verify-otp's 5/15min config", () => {
  it("blocks the 6th attempt within the 15-minute window", () => {
    const identifier = `otp-verify:${crypto.randomUUID()}@test.pdc`;
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit({ identifier, maxRequests: 5, windowMs: 15 * 60 * 1000 });
      expect(result.allowed).toBe(true);
    }
    const sixth = checkRateLimit({ identifier, maxRequests: 5, windowMs: 15 * 60 * 1000 });
    expect(sixth.allowed).toBe(false);
  });
});

describe("sendResumeOtp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithOtp.mockResolvedValue({ error: null });
  });

  it("calls signInWithOtp with shouldCreateUser: false and no emailRedirectTo", async () => {
    const { sendResumeOtp } = await import("../lib/onboarding/resume");
    const result = await sendResumeOtp("provider@usp.ac.fj");

    expect(result.success).toBe(true);
    expect(mockSignInWithOtp).toHaveBeenCalledTimes(1);
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: "provider@usp.ac.fj",
      options: { shouldCreateUser: false },
    });
  });

  it("returns success: false on a Supabase error, without leaking the raw error", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: "internal supabase failure detail" } });
    const { sendResumeOtp } = await import("../lib/onboarding/resume");
    const result = await sendResumeOtp("provider@usp.ac.fj");

    expect(result.success).toBe(false);
    expect(result.message).not.toContain("internal supabase failure detail");
  });
});

describe("verifyResumeOtp — error classification (hotfix, Deliverable 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never returns error: 'expired' — Supabase's response can't support that distinction (see diagnosis comment)", async () => {
    // Real production error observed in this project's Supabase auth logs
    // for BOTH a genuinely time-expired code and a wrong/incomplete one.
    mockVerifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid", code: "otp_expired" } });
    const { verifyResumeOtp } = await import("../lib/onboarding/resume");

    const result = await verifyResumeOtp("provider@usp.ac.fj", "123456");

    expect(result.success).toBe(false);
    expect(result.error).not.toBe("expired");
    expect(result.error).toBe("invalid");
  });

  it("returns one honest, combined message rather than confidently claiming a specific cause", async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid", code: "otp_expired" } });
    const { verifyResumeOtp } = await import("../lib/onboarding/resume");

    const result = await verifyResumeOtp("provider@usp.ac.fj", "123456");

    expect(result.message).toMatch(/incorrect.*or.*expired/i);
  });

  it("delegates to resumeOnboardingSession() and returns its result on a valid code", async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    mockResumeOnboardingSession.mockResolvedValue({ success: true, providerId: "p1", sessionToken: "s1", nextStep: "wallet" });
    const { verifyResumeOtp } = await import("../lib/onboarding/resume");

    const result = await verifyResumeOtp("provider@usp.ac.fj", "1234567");

    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: "provider@usp.ac.fj", token: "1234567", type: "email" });
    expect(mockResumeOnboardingSession).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, providerId: "p1", sessionToken: "s1", nextStep: "wallet" });
  });

  it("returns a generic failure if the code verifies but no provider is found", async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    mockResumeOnboardingSession.mockResolvedValue({ success: false });
    const { verifyResumeOtp } = await import("../lib/onboarding/resume");

    const result = await verifyResumeOtp("provider@usp.ac.fj", "123456");

    expect(result.success).toBe(false);
    expect(result.error).toBe("generic");
  });
});

describe("verifyOtp server action — digit-length tolerance (hotfix, Deliverable 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyOtp.mockResolvedValue({ error: null });
    mockResumeOnboardingSession.mockResolvedValue({ success: true, providerId: "p1", sessionToken: "s1", nextStep: "wallet" });
  });

  it("accepts a 6-digit code (reaches Supabase)", async () => {
    const { verifyOtp } = await import("../actions/onboarding/verify-otp");
    const result = await verifyOtp("provider@usp.ac.fj", "123456");
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it("accepts a 7-digit code — the exact length observed in production (e.g. '6041117')", async () => {
    const { verifyOtp } = await import("../actions/onboarding/verify-otp");
    const result = await verifyOtp("provider@usp.ac.fj", "6041117");
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: "provider@usp.ac.fj", token: "6041117", type: "email" });
    expect(result.success).toBe(true);
  });

  it("accepts an 8-digit code — the other length observed in production (e.g. '50798993')", async () => {
    const { verifyOtp } = await import("../actions/onboarding/verify-otp");
    const result = await verifyOtp("provider@usp.ac.fj", "50798993");
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it("rejects a 5-digit code before ever calling Supabase (too short)", async () => {
    const { verifyOtp } = await import("../actions/onboarding/verify-otp");
    const result = await verifyOtp("provider@usp.ac.fj", "12345");
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it("rejects a 9-digit code before ever calling Supabase (too long)", async () => {
    const { verifyOtp } = await import("../actions/onboarding/verify-otp");
    const result = await verifyOtp("provider@usp.ac.fj", "123456789");
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric string of valid length", async () => {
    const { verifyOtp } = await import("../actions/onboarding/verify-otp");
    const result = await verifyOtp("provider@usp.ac.fj", "abcdef");
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });
});

describe("verifyOtp server action — rate limiting and expiry are separate states (Deliverable 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid", code: "otp_expired" } });
  });

  it("rejects a malformed code before ever calling Supabase", async () => {
    const { verifyOtp } = await import("../actions/onboarding/verify-otp");
    const result = await verifyOtp("provider@usp.ac.fj", "123");

    expect(result.success).toBe(false);
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("blocks the 6th verify attempt for the same email within the window, with a message distinct from the expiry/invalid-code message", async () => {
    const { verifyOtp } = await import("../actions/onboarding/verify-otp");
    const email = `${crypto.randomUUID()}@usp.ac.fj`;

    for (let i = 0; i < 5; i++) {
      const result = await verifyOtp(email, "0000000");
      expect(result.message).not.toMatch(/too many attempts/i);
      expect(result.message).toMatch(/incorrect.*or.*expired/i);
    }
    const sixth = await verifyOtp(email, "0000000");
    expect(sixth.success).toBe(false);
    expect(sixth.message).toMatch(/too many attempts/i);
    // The two failure modes must never be conflated into the same message —
    // this is what the hotfix brief's "rateLimited and codeExpired must be
    // separate state" requirement reduces to at the server-action level.
    expect(sixth.message).not.toMatch(/incorrect.*or.*expired/i);
  });
});
