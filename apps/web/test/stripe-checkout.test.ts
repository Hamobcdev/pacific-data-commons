import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Session 23 (Deliverable 4) — smoke tests for the Stripe checkout route's
 * validation branches and the success path, mocking @/lib/stripe and
 * @/lib/onboarding/session the same way test/upload-payment.test.ts mocks
 * @/lib/supabase/server: this codebase has no prior test coverage for a
 * Next.js Route Handler to follow, but a Route Handler is just a
 * `(request: Request) => Promise<Response>` function — callable directly
 * in vitest's node environment without a running Next.js server.
 */

let sessionShouldFail = false;
const mockCreate = vi.fn();

vi.mock("@/lib/onboarding/session", () => ({
  validateOnboardingSession: async () => {
    if (sessionShouldFail) throw new InvalidOnboardingSessionErrorMock("Invalid session — provider not found");
    return { id: "prov-1", contact_email: "provider@usp.ac.fj", institution_id: null };
  },
  InvalidOnboardingSessionError: class InvalidOnboardingSessionErrorMock extends Error {},
}));

class InvalidOnboardingSessionErrorMock extends Error {}

let priceIds: Record<string, string | undefined> = {};

vi.mock("@/lib/stripe", () => ({
  getStripeClient: () => ({ checkout: { sessions: { create: mockCreate } } }),
  get STRIPE_PRICE_IDS() {
    return priceIds;
  },
}));

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    sessionShouldFail = false;
    mockCreate.mockReset();
    priceIds = {
      uploadFee: "price_upload",
      scannedPdfSurcharge: "price_surcharge",
      deploymentStandard: "price_standard",
      deploymentComplex: "price_complex",
    };
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("rejects an unrecognised purpose", async () => {
    const { POST } = await import("../app/api/stripe/checkout/route");
    const res = await POST(makeRequest({ purpose: "not_a_real_purpose" }));
    expect(res.status).toBe(400);
  });

  it("rejects upload_fee with no providerId/sessionToken", async () => {
    const { POST } = await import("../app/api/stripe/checkout/route");
    const res = await POST(makeRequest({ purpose: "upload_fee" }));
    expect(res.status).toBe(400);
  });

  it("rejects upload_fee with an invalid onboarding session", async () => {
    sessionShouldFail = true;
    const { POST } = await import("../app/api/stripe/checkout/route");
    const res = await POST(makeRequest({ purpose: "upload_fee", providerId: "prov-1", sessionToken: "bad" }));
    expect(res.status).toBe(401);
  });

  it("rejects a deployment purpose with no contactEmail", async () => {
    const { POST } = await import("../app/api/stripe/checkout/route");
    const res = await POST(makeRequest({ purpose: "deployment_standard" }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when the relevant price ID isn't configured", async () => {
    priceIds = { uploadFee: undefined };
    const { POST } = await import("../app/api/stripe/checkout/route");
    const res = await POST(makeRequest({ purpose: "upload_fee", providerId: "prov-1", sessionToken: "good" }));
    expect(res.status).toBe(503);
  });

  it("creates a checkout session for a valid upload_fee request", async () => {
    mockCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session-abc" });
    const { POST } = await import("../app/api/stripe/checkout/route");
    const res = await POST(makeRequest({ purpose: "upload_fee", providerId: "prov-1", sessionToken: "good", pdfSurcharge: false }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { checkoutUrl: string };
    expect(body.checkoutUrl).toBe("https://checkout.stripe.com/session-abc");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        metadata: expect.objectContaining({ purpose: "upload_fee", providerId: "prov-1", datasetSlot: "good" }),
      }),
    );
  });

  it("adds a second line item for the scanned PDF surcharge", async () => {
    mockCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session-abc" });
    const { POST } = await import("../app/api/stripe/checkout/route");
    await POST(makeRequest({ purpose: "upload_fee", providerId: "prov-1", sessionToken: "good", pdfSurcharge: true }));
    const call = mockCreate.mock.calls[0]?.[0] as { line_items: Array<{ price: string }> };
    expect(call.line_items).toHaveLength(2);
  });

  it("returns 503 without leaking the raw Stripe error when session creation throws", async () => {
    mockCreate.mockRejectedValue(new Error("stripe internal failure"));
    const { POST } = await import("../app/api/stripe/checkout/route");
    const res = await POST(makeRequest({ purpose: "upload_fee", providerId: "prov-1", sessionToken: "good" }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { message: string };
    expect(body.message).not.toContain("stripe internal failure");
  });
});
