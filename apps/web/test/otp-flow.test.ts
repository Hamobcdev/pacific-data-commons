import { describe, expect, it, vi, beforeEach } from "vitest";
import { checkRateLimit } from "../lib/rate-limit";
import { parsePastedCode, OTP_CODE_LENGTH } from "../lib/onboarding/otp-code";

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

describe("parsePastedCode", () => {
  it("pads a full 6-digit paste with no truncation", () => {
    expect(parsePastedCode("123456")).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("strips non-digit characters before splitting (e.g. 'Your code is: 482913')", () => {
    expect(parsePastedCode("Your code is: 482913")).toEqual(["4", "8", "2", "9", "1", "3"]);
  });

  it("pads a short paste with empty strings for the remaining boxes", () => {
    expect(parsePastedCode("42")).toEqual(["4", "2", "", "", "", ""]);
  });

  it("truncates a longer-than-6-digit paste to the first 6 digits", () => {
    expect(parsePastedCode("1234567890")).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("returns all-empty for a paste with no digits", () => {
    expect(parsePastedCode("no digits here")).toEqual(["", "", "", "", "", ""]);
  });

  it("respects OTP_CODE_LENGTH", () => {
    expect(OTP_CODE_LENGTH).toBe(6);
  });
});

describe("checkRateLimit — resetInSeconds (Deliverable 3)", () => {
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

describe("verifyResumeOtp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error: 'expired' on an expired-code response, without calling resumeOnboardingSession", async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: "Token has expired" } });
    const { verifyResumeOtp } = await import("../lib/onboarding/resume");

    const result = await verifyResumeOtp("provider@usp.ac.fj", "123456");

    expect(result.success).toBe(false);
    expect(result.error).toBe("expired");
    expect(mockResumeOnboardingSession).not.toHaveBeenCalled();
  });

  it("returns error: 'invalid' on a wrong-code response", async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: "Invalid token" } });
    const { verifyResumeOtp } = await import("../lib/onboarding/resume");

    const result = await verifyResumeOtp("provider@usp.ac.fj", "000000");

    expect(result.success).toBe(false);
    expect(result.error).toBe("invalid");
  });

  it("delegates to resumeOnboardingSession() and returns its result on a valid code", async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    mockResumeOnboardingSession.mockResolvedValue({ success: true, providerId: "p1", sessionToken: "s1", nextStep: "wallet" });
    const { verifyResumeOtp } = await import("../lib/onboarding/resume");

    const result = await verifyResumeOtp("provider@usp.ac.fj", "123456");

    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: "provider@usp.ac.fj", token: "123456", type: "email" });
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

describe("verifyOtp server action — validation and rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyOtp.mockResolvedValue({ error: { message: "Invalid token" } });
  });

  it("rejects a malformed (non-6-digit) code before ever calling Supabase", async () => {
    const { verifyOtp } = await import("../actions/onboarding/verify-otp");
    const result = await verifyOtp("provider@usp.ac.fj", "123");

    expect(result.success).toBe(false);
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("blocks the 6th verify attempt for the same email within the window", async () => {
    const { verifyOtp } = await import("../actions/onboarding/verify-otp");
    const email = `${crypto.randomUUID()}@usp.ac.fj`;

    for (let i = 0; i < 5; i++) {
      const result = await verifyOtp(email, "000000");
      expect(result.message).not.toMatch(/too many attempts/i);
    }
    const sixth = await verifyOtp(email, "000000");
    expect(sixth.success).toBe(false);
    expect(sixth.message).toMatch(/too many attempts/i);
  });
});
