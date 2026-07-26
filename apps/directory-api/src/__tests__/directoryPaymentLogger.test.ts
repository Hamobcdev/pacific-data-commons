import { describe, expect, it } from "vitest";
import type { SettledPdcPayment } from "@pdc/x402-adapter";
import { logSettledDirectoryQuery } from "../services/directoryPaymentLogger.js";
import { createFakeSupabase, getFakeInserts } from "./testUtils.js";

function basePayment(overrides: Partial<SettledPdcPayment>): SettledPdcPayment {
  return {
    method: "GET",
    path: "/search",
    algoTxId: "TX123",
    payerAddress: "BUYERADDR",
    amountUsdc: "0.01",
    network: "testnet",
    responseBody: undefined,
    ...overrides,
  };
}

describe("logSettledDirectoryQuery", () => {
  it("logs a directory_query row with no provider/endpoint for /search, echoing filters", async () => {
    const supabase = createFakeSupabase({ transactions_log: {} });
    await logSettledDirectoryQuery(
      supabase,
      basePayment({ path: "/search", responseBody: { results: [], filters: { category: "fisheries" } } }),
    );

    const [insert] = getFakeInserts(supabase);
    expect(insert?.table).toBe("transactions_log");
    expect(insert?.row).toMatchObject({
      transaction_type: "directory_query",
      provider_id: null,
      endpoint_id: null,
      algo_tx_id: "TX123",
      amount_usdc: "0.01",
      buyer_wallet_address: "BUYERADDR",
      query_parameters: { category: "fisheries" },
    });
  });

  it("pulls provider_id from the response body for /provider/:id", async () => {
    const supabase = createFakeSupabase({ transactions_log: {} });
    await logSettledDirectoryQuery(
      supabase,
      basePayment({ path: "/provider/prov-1", responseBody: { provider: { id: "prov-1" } } }),
    );

    const [insert] = getFakeInserts(supabase);
    expect(insert?.row).toMatchObject({ provider_id: "prov-1", endpoint_id: null });
  });

  it("pulls provider_id and endpoint_id from the response body for /endpoint/:id", async () => {
    const supabase = createFakeSupabase({ transactions_log: {} });
    await logSettledDirectoryQuery(
      supabase,
      basePayment({
        path: "/endpoint/end-1",
        responseBody: { endpoint: { id: "end-1", providerId: "prov-1" } },
      }),
    );

    const [insert] = getFakeInserts(supabase);
    expect(insert?.row).toMatchObject({ provider_id: "prov-1", endpoint_id: "end-1" });
  });

  it("pulls provider_id and endpoint_id from the response body for /verify/:certHash", async () => {
    const supabase = createFakeSupabase({ transactions_log: {} });
    await logSettledDirectoryQuery(
      supabase,
      basePayment({
        path: "/verify/abc123",
        responseBody: { verification: { providerId: "prov-1", endpointId: "end-1" } },
      }),
    );

    const [insert] = getFakeInserts(supabase);
    expect(insert?.row).toMatchObject({ provider_id: "prov-1", endpoint_id: "end-1" });
  });

  it("does not throw when the insert fails — the buyer already paid", async () => {
    const supabase = createFakeSupabase({ transactions_log: { error: { message: "insert failed" } } });
    await expect(logSettledDirectoryQuery(supabase, basePayment({}))).resolves.toBeUndefined();
  });
});
