import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SettledPdcPayment } from "@pdc/x402-adapter";
import { logSettledEndpointPayment } from "../src/services/transactionLogger.js";
import type { DirectoryContext } from "../src/services/directoryContext.js";

/**
 * Minimal fake — only the two calls transactionLogger.ts actually makes:
 * .from("transactions_log").insert(row) and .rpc(name, args). Deliberately
 * not shared with apps/directory-api's testUtils.ts (different package,
 * and that fake has no .rpc() support at all — this app's transaction
 * logger is the first caller of increment_tier12_accrual /
 * increment_provider_query_count from application code).
 */
function fakeSupabase(opts: { insertError?: { message: string }; rpcError?: { message: string } } = {}) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];

  const client = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return Promise.resolve({ data: null, error: opts.insertError ?? null });
      },
    }),
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: null, error: opts.rpcError ?? null });
    },
  };

  return { client: client as unknown as SupabaseClient, inserts, rpcCalls };
}

function basePayment(overrides: Partial<SettledPdcPayment>): SettledPdcPayment {
  return {
    method: "GET",
    path: "/summary",
    algoTxId: "TX123",
    payerAddress: "BUYERADDR",
    amountUsdc: "0.01",
    network: "mainnet",
    responseBody: undefined,
    ...overrides,
  };
}

const context: DirectoryContext = {
  providerId: "prov-1",
  endpointId: "end-1",
  providerPct: 97,
  sbpFeePct: 3,
};

describe("logSettledEndpointPayment", () => {
  it("logs a data_query_tier1 row for /summary and accrues the tier12 fee", async () => {
    const { client, inserts, rpcCalls } = fakeSupabase();
    await logSettledEndpointPayment(client, basePayment({ path: "/summary", amountUsdc: "0.01" }), context);

    expect(inserts[0]?.row).toMatchObject({
      transaction_type: "data_query_tier1",
      provider_id: "prov-1",
      endpoint_id: "end-1",
      algo_tx_id: "TX123",
      amount_usdc: "0.01",
      pricing_tier: 1,
      provider_amount: null,
      sbp_fee_amount: null,
      split_executed: false,
      buyer_wallet_address: "BUYERADDR",
      response_tier: "summary",
    });
    expect(rpcCalls).toContainEqual({ fn: "increment_tier12_accrual", args: { p_provider_id: "prov-1", p_amount: 0.01 } });
    expect(rpcCalls).toContainEqual({ fn: "increment_provider_query_count", args: { p_provider_id: "prov-1" } });
  });

  it("logs a data_query_tier3 row for /full with a computed 97/3 split, no accrual RPC", async () => {
    const { client, inserts, rpcCalls } = fakeSupabase();
    await logSettledEndpointPayment(client, basePayment({ path: "/full", amountUsdc: "25" }), context);

    expect(inserts[0]?.row).toMatchObject({
      transaction_type: "data_query_tier3",
      pricing_tier: 3,
      provider_amount: 24.25,
      sbp_fee_amount: 0.75,
      split_executed: false,
    });
    expect(rpcCalls.find((c) => c.fn === "increment_tier12_accrual")).toBeUndefined();
    expect(rpcCalls).toContainEqual({ fn: "increment_provider_query_count", args: { p_provider_id: "prov-1" } });
  });

  it("skips logging entirely when directory context is null (unresolved listing)", async () => {
    const { client, inserts, rpcCalls } = fakeSupabase();
    await logSettledEndpointPayment(client, basePayment({}), null);

    expect(inserts).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });

  it("ignores a payment on an unrecognized path without throwing", async () => {
    const { client, inserts } = fakeSupabase();
    await expect(logSettledEndpointPayment(client, basePayment({ path: "/unknown" }), context)).resolves.toBeUndefined();
    expect(inserts).toHaveLength(0);
  });

  it("does not throw when the insert fails — the buyer already paid", async () => {
    const { client } = fakeSupabase({ insertError: { message: "insert failed" } });
    await expect(logSettledEndpointPayment(client, basePayment({}), context)).resolves.toBeUndefined();
  });

  it("does not throw when the accrual RPC fails after a successful insert", async () => {
    const { client } = fakeSupabase({ rpcError: { message: "rpc failed" } });
    await expect(logSettledEndpointPayment(client, basePayment({ path: "/summary" }), context)).resolves.toBeUndefined();
  });
});
