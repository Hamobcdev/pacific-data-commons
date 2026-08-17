import { describe, expect, it, vi, beforeEach } from "vitest";
import { UPLOAD_FEE_USDC, SCANNED_PDF_SURCHARGE_USDC } from "../lib/upload/constants";

/**
 * Session 23 (Deliverable 3B) — same fake-service-client pattern as
 * resume-session.test.ts: a minimal per-table chain fake rather than the
 * full chainable builder, since these actions only ever do a single
 * select/eq/eq/order/limit/maybeSingle read or a single insert.
 */

interface TableConfig {
  selectData?: Record<string, unknown> | null;
  insertError?: { message: string } | null;
}

function fakeServiceClient(tables: Record<string, TableConfig>) {
  const inserted: Array<{ table: string; row: Record<string, unknown> }> = [];
  return {
    inserted,
    client: {
      from: (table: string) => {
        const config = tables[table] ?? {};
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: () => Promise.resolve({ data: config.selectData ?? null, error: null }),
          insert: (row: Record<string, unknown>) => {
            inserted.push({ table, row });
            return Promise.resolve({ error: config.insertError ?? null });
          },
        };
        return chain;
      },
    },
  };
}

let serviceClient: ReturnType<typeof fakeServiceClient>;
let sessionShouldFail = false;

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => serviceClient.client,
}));

vi.mock("@/lib/onboarding/session", () => ({
  validateOnboardingSession: async () => {
    if (sessionShouldFail) throw new InvalidOnboardingSessionErrorMock("Invalid session — provider not found");
    return { id: "prov-1", contact_email: "provider@usp.ac.fj", institution_id: null };
  },
  InvalidOnboardingSessionError: class InvalidOnboardingSessionErrorMock extends Error {},
}));

class InvalidOnboardingSessionErrorMock extends Error {}

describe("checkUploadPaymentStatus", () => {
  beforeEach(() => {
    sessionShouldFail = false;
  });

  it("returns 'unpaid' when no upload_payments row exists for this dataset slot", async () => {
    serviceClient = fakeServiceClient({ upload_payments: { selectData: null } });
    const { checkUploadPaymentStatus } = await import("../actions/upload/upload-payment");
    const result = await checkUploadPaymentStatus("prov-1", "session-token");
    expect(result).toEqual({ success: true, status: "unpaid", paymentMethod: null });
  });

  it("returns 'confirmed' when the latest row is confirmed", async () => {
    serviceClient = fakeServiceClient({ upload_payments: { selectData: { payment_status: "confirmed", payment_method: "usdc" } } });
    const { checkUploadPaymentStatus } = await import("../actions/upload/upload-payment");
    const result = await checkUploadPaymentStatus("prov-1", "session-token");
    expect(result.status).toBe("confirmed");
  });

  it("returns 'pending' when the latest row is pending", async () => {
    serviceClient = fakeServiceClient({ upload_payments: { selectData: { payment_status: "pending", payment_method: "invoice" } } });
    const { checkUploadPaymentStatus } = await import("../actions/upload/upload-payment");
    const result = await checkUploadPaymentStatus("prov-1", "session-token");
    expect(result.status).toBe("pending");
    expect(result.paymentMethod).toBe("invoice");
  });

  it("fails with an invalid session rather than leaking the DB check", async () => {
    sessionShouldFail = true;
    serviceClient = fakeServiceClient({ upload_payments: { selectData: null } });
    const { checkUploadPaymentStatus } = await import("../actions/upload/upload-payment");
    const result = await checkUploadPaymentStatus("prov-1", "bad-token");
    expect(result.success).toBe(false);
  });
});

describe("submitUsdcPaymentClaim", () => {
  beforeEach(() => {
    sessionShouldFail = false;
  });

  it("rejects a transaction ID that's too short to be real", async () => {
    serviceClient = fakeServiceClient({});
    const { submitUsdcPaymentClaim } = await import("../actions/upload/upload-payment");
    const result = await submitUsdcPaymentClaim("prov-1", "session-token", "abc", false);
    expect(result.success).toBe(false);
    expect(serviceClient.inserted).toHaveLength(0);
  });

  it("inserts a pending row keyed to the session token as dataset_slot", async () => {
    serviceClient = fakeServiceClient({});
    const { submitUsdcPaymentClaim } = await import("../actions/upload/upload-payment");
    const result = await submitUsdcPaymentClaim("prov-1", "session-token", "AAAABBBBCCCCDDDD1234", false);
    expect(result.success).toBe(true);
    expect(serviceClient.inserted).toHaveLength(1);
    const row = serviceClient.inserted[0]?.row;
    expect(row?.dataset_slot).toBe("session-token");
    expect(row?.payment_status).toBe("pending");
    expect(row?.payment_method).toBe("usdc");
    expect(row?.amount_usdc).toBe(UPLOAD_FEE_USDC);
  });

  it("adds the scanned-PDF surcharge when flagged", async () => {
    serviceClient = fakeServiceClient({});
    const { submitUsdcPaymentClaim } = await import("../actions/upload/upload-payment");
    await submitUsdcPaymentClaim("prov-1", "session-token", "AAAABBBBCCCCDDDD1234", true);
    expect(serviceClient.inserted[0]?.row.amount_usdc).toBe(UPLOAD_FEE_USDC + SCANNED_PDF_SURCHARGE_USDC);
  });
});

describe("requestUploadInvoice", () => {
  beforeEach(() => {
    sessionShouldFail = false;
  });

  it("inserts a pending invoice row", async () => {
    serviceClient = fakeServiceClient({});
    const { requestUploadInvoice } = await import("../actions/upload/upload-payment");
    const result = await requestUploadInvoice("prov-1", "session-token", false);
    expect(result.success).toBe(true);
    expect(serviceClient.inserted[0]?.row.payment_method).toBe("invoice");
    expect(serviceClient.inserted[0]?.row.payment_status).toBe("pending");
  });
});
