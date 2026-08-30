import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { complianceRoute } from "../routes/compliance.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { createFakeSupabase, getFakeInserts } from "./testUtils.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const COMPLIANCE_KEY = "test-compliance-key";

/** Same pattern as internal.test.ts's buildTestApp — /compliance/* is never
 * registered with PdcPaymentGate, so no payment gate is needed here either;
 * complianceAuth is the only middleware in front of the gated routes. */
function buildTestApp(supabase: ReturnType<typeof createFakeSupabase>, envOverrides: Partial<Env> = {}) {
  const app = new Hono<AppBindings>();
  const env = {
    ALGORAND_NETWORK: "testnet",
    COMPLIANCE_API_KEY: COMPLIANCE_KEY,
    PUBLIC_URL: "http://localhost:8787",
    ...envOverrides,
  } as Env;

  app.use("*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("env", env);
    await next();
  });

  app.route("/", complianceRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("POST /compliance/kyc/verify", () => {
  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      wallet_address: "ALGORANDADDRESS58CHARS",
      entity_name: "USP Fisheries Department",
      entity_type: "provider",
      country_code: "WS",
      contact_email: "contact@usp.example",
      platform_node: "pdc-mainnet",
      ...overrides,
    };
  }

  it("401s without a valid Authorization header", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/compliance/kyc/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });
    expect(res.status).toBe(401);
  });

  it("401s with the wrong bearer token", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/compliance/kyc/verify", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer wrong-key" },
      body: JSON.stringify(validBody()),
    });
    expect(res.status).toBe(401);
  });

  it("400s on a missing required field", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/compliance/kyc/verify", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${COMPLIANCE_KEY}` },
      body: JSON.stringify(validBody({ contact_email: undefined })),
    });
    expect(res.status).toBe(400);
  });

  it("400s on an invalid entity_type", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/compliance/kyc/verify", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${COMPLIANCE_KEY}` },
      body: JSON.stringify(validBody({ entity_type: "bogus" })),
    });
    expect(res.status).toBe(400);
  });

  it("returns a stub pending_review verification and records an audit row", async () => {
    const supabase = createFakeSupabase({ compliance_checks: { insertResult: null } });
    const app = buildTestApp(supabase);

    const res = await app.request("/compliance/kyc/verify", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${COMPLIANCE_KEY}` },
      body: JSON.stringify(validBody()),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { verification_id: string; status: string; stub: boolean; pep_check: string; sanctions_check: string };
    expect(body.verification_id).toMatch(/^kyc-/);
    expect(body.status).toBe("pending_review");
    expect(body.stub).toBe(true);
    expect(body.pep_check).toBe("stub_clear");
    expect(body.sanctions_check).toBe("stub_clear");

    const inserts = getFakeInserts(supabase).filter((i) => i.table === "compliance_checks");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.row).toMatchObject({ check_type: "kyc", entity_type: "provider", wallet_address: "ALGORANDADDRESS58CHARS" });
  });
});

describe("POST /compliance/aml/screen-transaction", () => {
  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      tx_id: "TX123",
      wallet_from: "WALLETFROM",
      wallet_to: "WALLETTO",
      amount_usdc: 0.01,
      platform_node: "pdc-mainnet",
      transaction_type: "data_query",
      ...overrides,
    };
  }

  it("401s without a valid Authorization header", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/compliance/aml/screen-transaction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });
    expect(res.status).toBe(401);
  });

  it("400s on an invalid transaction_type", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/compliance/aml/screen-transaction", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${COMPLIANCE_KEY}` },
      body: JSON.stringify(validBody({ transaction_type: "bogus" })),
    });
    expect(res.status).toBe(400);
  });

  it("returns stub_cleared with fatf_travel_rule_applicable false below threshold", async () => {
    const supabase = createFakeSupabase({ compliance_checks: { insertResult: null } });
    const app = buildTestApp(supabase);

    const res = await app.request("/compliance/aml/screen-transaction", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${COMPLIANCE_KEY}` },
      body: JSON.stringify(validBody({ amount_usdc: 0.01 })),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; stub: boolean; fatf_travel_rule_applicable: boolean; travel_rule_threshold_usdc: number };
    expect(body.status).toBe("stub_cleared");
    expect(body.stub).toBe(true);
    expect(body.fatf_travel_rule_applicable).toBe(false);
    expect(body.travel_rule_threshold_usdc).toBe(1000);

    const inserts = getFakeInserts(supabase).filter((i) => i.table === "compliance_checks");
    expect(inserts[0]?.row).toMatchObject({ check_type: "aml_transaction", fatf_applicable: false });
  });

  it("flags fatf_travel_rule_applicable true at or above the $1000 threshold", async () => {
    const supabase = createFakeSupabase({ compliance_checks: { insertResult: null } });
    const app = buildTestApp(supabase);

    const res = await app.request("/compliance/aml/screen-transaction", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${COMPLIANCE_KEY}` },
      body: JSON.stringify(validBody({ amount_usdc: 1500 })),
    });

    const body = (await res.json()) as { fatf_travel_rule_applicable: boolean };
    expect(body.fatf_travel_rule_applicable).toBe(true);

    const inserts = getFakeInserts(supabase).filter((i) => i.table === "compliance_checks");
    expect(inserts[0]?.row).toMatchObject({ fatf_applicable: true });
  });
});

describe("GET /compliance/status", () => {
  it("is public — no Authorization header required", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/compliance/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stub: boolean; live: boolean; cbs_oversight: { monetary_authority: string } };
    expect(body.stub).toBe(true);
    expect(body.live).toBe(false);
    expect(body.cbs_oversight.monetary_authority).toBe("Central Bank of Samoa");
  });
});

describe("GET /compliance/escrow/summary", () => {
  it("401s without a valid Authorization header", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/compliance/escrow/summary");
    expect(res.status).toBe(401);
  });

  it("summarises provider and reserve position counts with the CBS hierarchy", async () => {
    const supabase = createFakeSupabase({
      payment_providers: { data: [{ status: "active" }, { status: "active" }, ...Array.from({ length: 10 }, () => ({ status: "stub" }))] },
      reserve_positions: { data: [] },
    });
    const app = buildTestApp(supabase);

    const res = await app.request("/compliance/escrow/summary", {
      headers: { authorization: `Bearer ${COMPLIANCE_KEY}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      escrow_summary: { custodian: string; total_providers: number; active_providers: number; stub_providers: number; usdc_in_custody_stub: number };
      monetary_authority_hierarchy: { tier_1: string; tier_4: string };
    };
    expect(body.escrow_summary.custodian).toBe("Central Bank of Samoa");
    expect(body.escrow_summary.total_providers).toBe(12);
    expect(body.escrow_summary.active_providers).toBe(2);
    expect(body.escrow_summary.stub_providers).toBe(10);
    expect(body.escrow_summary.usdc_in_custody_stub).toBe(0);
    expect(body.monetary_authority_hierarchy.tier_1).toContain("Central Bank of Samoa");
    expect(body.monetary_authority_hierarchy.tier_4).toContain("SBP");
  });
});
