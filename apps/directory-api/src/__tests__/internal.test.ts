import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { describe, expect, it, vi, afterEach } from "vitest";
import { internalRoute } from "../routes/internal.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { createFakeSupabase, getFakeInserts, getFakeUpdates } from "./testUtils.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const INTERNAL_KEY = "test-internal-key";

/** Same pattern as freeRoutes.test.ts / attribution.test.ts's buildTestApp
 * — /internal/* is never registered with PdcPaymentGate, so no payment gate
 * is needed here either; internalAuth is the only middleware in front of it. */
function buildTestApp(supabase: ReturnType<typeof createFakeSupabase>, envOverrides: Partial<Env> = {}) {
  const app = new Hono<AppBindings>();
  const env = {
    ALGORAND_NETWORK: "testnet",
    INTERNAL_API_KEY: INTERNAL_KEY,
    EMAIL_FROM: "test@example.com",
    PUBLIC_URL: "http://localhost:8787",
    ...envOverrides,
  } as Env;

  app.use("*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("env", env);
    await next();
  });

  app.route("/", internalRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /internal/certified-hash/:endpointId", () => {
  const endpointId = randomUUID();

  it("401s without a valid X-Internal-Api-Key header", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request(`/internal/certified-hash/${endpointId}`);
    expect(res.status).toBe(401);
  });

  it("401s with the wrong key", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request(`/internal/certified-hash/${endpointId}`, {
      headers: { "x-internal-api-key": "wrong-key" },
    });
    expect(res.status).toBe(401);
  });

  it("returns the active certificate's dataset_content_hash", async () => {
    const app = buildTestApp(
      createFakeSupabase({
        provenance_certificates: { data: [{ dataset_content_hash: "abc123" }] },
      }),
    );
    const res = await app.request(`/internal/certified-hash/${endpointId}`, {
      headers: { "x-internal-api-key": INTERNAL_KEY },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataset_content_hash: string | null };
    expect(body.dataset_content_hash).toBe("abc123");
  });

  it("returns null when no active certificate exists", async () => {
    const app = buildTestApp(createFakeSupabase({ provenance_certificates: { data: [] } }));
    const res = await app.request(`/internal/certified-hash/${endpointId}`, {
      headers: { "x-internal-api-key": INTERNAL_KEY },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataset_content_hash: string | null };
    expect(body.dataset_content_hash).toBeNull();
  });

  it("400s on a malformed endpoint id", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request(`/internal/certified-hash/not-a-uuid`, {
      headers: { "x-internal-api-key": INTERNAL_KEY },
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /internal/integrity-event", () => {
  const endpointId = randomUUID();
  const agentId = randomUUID();

  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      endpoint_id: endpointId,
      check_trigger: "agent_query",
      status: "pass",
      expected_hash: "abc123",
      actual_hash: "abc123",
      agent_id: agentId,
      transaction_blocked: false,
      ...overrides,
    };
  }

  it("401s without a valid X-Internal-Api-Key header", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/internal/integrity-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });
    expect(res.status).toBe(401);
  });

  it("records a passing check and resets the fail count", async () => {
    const supabase = createFakeSupabase({
      endpoint_integrity_events: { insertResult: { id: "evt-1" } },
      endpoints: { data: [{ id: endpointId, title: "Test Endpoint", provider_id: "prov-1", integrity_fail_count: 2, integrity_flagged: false }] },
    });
    const app = buildTestApp(supabase);

    const res = await app.request("/internal/integrity-event", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-api-key": INTERNAL_KEY },
      body: JSON.stringify(validBody({ status: "pass" })),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { event_id: string; integrity_fail_count: number; integrity_flagged: boolean };
    expect(body).toEqual({ event_id: "evt-1", integrity_fail_count: 0, integrity_flagged: false });

    const updates = getFakeUpdates(supabase);
    expect(updates[0]?.row).toMatchObject({ last_integrity_status: "pass", integrity_fail_count: 0 });
  });

  it("increments the fail count on status=fail but does not flag below the 3-strike threshold", async () => {
    const supabase = createFakeSupabase({
      endpoint_integrity_events: { insertResult: { id: "evt-2" } },
      endpoints: { data: [{ id: endpointId, title: "Test Endpoint", provider_id: "prov-1", integrity_fail_count: 1, integrity_flagged: false }] },
    });
    const app = buildTestApp(supabase);

    const res = await app.request("/internal/integrity-event", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-api-key": INTERNAL_KEY },
      body: JSON.stringify(validBody({ status: "fail", transaction_blocked: true })),
    });

    const body = (await res.json()) as { integrity_fail_count: number; integrity_flagged: boolean };
    expect(body).toEqual({ event_id: "evt-2", integrity_fail_count: 2, integrity_flagged: false });
  });

  it("flags the endpoint on the 3rd consecutive fail (Decision 50)", async () => {
    const supabase = createFakeSupabase({
      endpoint_integrity_events: { insertResult: { id: "evt-3" } },
      endpoints: { data: [{ id: endpointId, title: "Test Endpoint", provider_id: "prov-1", integrity_fail_count: 2, integrity_flagged: false }] },
      providers: { data: [{ contact_email: "provider@example.com" }] },
    });
    const app = buildTestApp(supabase);

    const res = await app.request("/internal/integrity-event", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-api-key": INTERNAL_KEY },
      body: JSON.stringify(validBody({ status: "fail", transaction_blocked: true })),
    });

    const body = (await res.json()) as { integrity_fail_count: number; integrity_flagged: boolean };
    expect(body).toEqual({ event_id: "evt-3", integrity_fail_count: 3, integrity_flagged: true });

    const updates = getFakeUpdates(supabase);
    expect(updates[0]?.row).toMatchObject({ integrity_flagged: true });
  });

  it("does not re-flag (or re-notify) an endpoint that's already flagged", async () => {
    const supabase = createFakeSupabase({
      endpoint_integrity_events: { insertResult: { id: "evt-4" } },
      endpoints: { data: [{ id: endpointId, title: "Test Endpoint", provider_id: "prov-1", integrity_fail_count: 5, integrity_flagged: true }] },
    });
    const app = buildTestApp(supabase);

    const res = await app.request("/internal/integrity-event", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-api-key": INTERNAL_KEY },
      body: JSON.stringify(validBody({ status: "fail", transaction_blocked: true })),
    });

    const body = (await res.json()) as { integrity_fail_count: number; integrity_flagged: boolean };
    expect(body).toEqual({ event_id: "evt-4", integrity_fail_count: 6, integrity_flagged: true });

    const updates = getFakeUpdates(supabase);
    expect(updates[0]?.row).not.toHaveProperty("integrity_flagged_at");
  });

  it("400s on an invalid status value", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/internal/integrity-event", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-api-key": INTERNAL_KEY },
      body: JSON.stringify(validBody({ status: "bogus" })),
    });
    expect(res.status).toBe(400);
  });

  it("404s when the endpoint doesn't exist", async () => {
    const supabase = createFakeSupabase({
      endpoint_integrity_events: { insertResult: { id: "evt-5" } },
      endpoints: { data: [] },
    });
    const app = buildTestApp(supabase);

    const res = await app.request("/internal/integrity-event", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-api-key": INTERNAL_KEY },
      body: JSON.stringify(validBody()),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /internal/dispatch-update-notifications", () => {
  const endpointId = randomUUID();
  const versionId = randomUUID();

  function versionRow(overrides: Record<string, unknown> = {}) {
    return {
      id: versionId,
      version_number: 2,
      update_category: "additive",
      provider_change_description: "Added Q2 2026 records.",
      records_added: 847,
      records_modified: 0,
      new_parameters: null,
      date_range_extended: true,
      certified_at: "2026-08-12T00:00:00.000Z",
      ...overrides,
    };
  }

  it("401s without a valid X-Internal-Api-Key header", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/internal/dispatch-update-notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint_id: endpointId, version_id: versionId }),
    });
    expect(res.status).toBe(401);
  });

  it("400s on a malformed body", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/internal/dispatch-update-notifications", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-api-key": INTERNAL_KEY },
      body: JSON.stringify({ endpoint_id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("404s when the version doesn't exist", async () => {
    const supabase = createFakeSupabase({ endpoint_versions: { data: [] } });
    const app = buildTestApp(supabase);
    const res = await app.request("/internal/dispatch-update-notifications", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-api-key": INTERNAL_KEY },
      body: JSON.stringify({ endpoint_id: endpointId, version_id: versionId }),
    });
    expect(res.status).toBe(404);
  });

  it("notifies agent wallets that queried this endpoint and buyers who opted in by email, then rolls up the count onto the version", async () => {
    const supabase = createFakeSupabase({
      endpoint_versions: { data: [versionRow()] },
      endpoints: { data: [{ id: endpointId, title: "Pacific Fisheries Status", endpoint_url: "https://provider.example/api", provider_id: "prov-1", version_number: 2 }] },
      providers: { data: [{ institution_name: "USP Fisheries" }] },
      transactions_log: { data: [{ algo_tx_id: "TX1" }, { algo_tx_id: "TX2" }] },
      agent_run_endpoints: { data: [{ signed_by: "AGENTWALLET1" }, { signed_by: "AGENTWALLET1" }, { signed_by: "AGENTWALLET2" }] },
      community_ratings: { data: [{ rater_email: "buyer@example.com" }] },
    });
    const app = buildTestApp(supabase);

    const res = await app.request("/internal/dispatch-update-notifications", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-api-key": INTERNAL_KEY },
      body: JSON.stringify({ endpoint_id: endpointId, version_id: versionId }),
    });

    expect(res.status).toBe(200);

    const inserts = getFakeInserts(supabase).filter((i) => i.table === "endpoint_update_notifications");
    // 2 distinct agent wallets (deduplicated from 3 rows) + 1 buyer email
    expect(inserts).toHaveLength(3);
    const agentInserts = inserts.filter((i) => (i.row as { recipient_type: string }).recipient_type === "agent_wallet");
    expect(agentInserts.map((i) => (i.row as { agent_wallet: string }).agent_wallet).sort()).toEqual(["AGENTWALLET1", "AGENTWALLET2"]);
    const buyerInserts = inserts.filter((i) => (i.row as { recipient_type: string }).recipient_type === "buyer_email");
    expect(buyerInserts).toHaveLength(1);
    expect((buyerInserts[0]?.row as { buyer_email: string }).buyer_email).toBe("buyer@example.com");

    const versionUpdates = getFakeUpdates(supabase).filter((u) => u.table === "endpoint_versions");
    expect(versionUpdates[0]?.row).toMatchObject({ notification_count: 3 });
  });

  it("dispatches cleanly with zero recipients — no notifications for an endpoint nobody has queried", async () => {
    const supabase = createFakeSupabase({
      endpoint_versions: { data: [versionRow()] },
      endpoints: { data: [{ id: endpointId, title: "Pacific Fisheries Status", endpoint_url: "https://provider.example/api", provider_id: "prov-1", version_number: 2 }] },
      providers: { data: [{ institution_name: "USP Fisheries" }] },
      transactions_log: { data: [] },
      community_ratings: { data: [] },
    });
    const app = buildTestApp(supabase);

    const res = await app.request("/internal/dispatch-update-notifications", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-api-key": INTERNAL_KEY },
      body: JSON.stringify({ endpoint_id: endpointId, version_id: versionId }),
    });

    expect(res.status).toBe(200);
    const inserts = getFakeInserts(supabase).filter((i) => i.table === "endpoint_update_notifications");
    expect(inserts).toHaveLength(0);
    const versionUpdates = getFakeUpdates(supabase).filter((u) => u.table === "endpoint_versions");
    expect(versionUpdates[0]?.row).toMatchObject({ notification_count: 0 });
  });
});

describe("POST /internal/health-check", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("401s without a valid X-Internal-Api-Key header", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/internal/health-check", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("pings active endpoints and returns a summary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const supabase = createFakeSupabase({
      endpoints: { data: [{ id: randomUUID(), title: "Pacific Fisheries Status", health_check_url: "https://pdcpilot-endpoint-production.up.railway.app/health", consecutive_health_fails: 0 }] },
    });
    const app = buildTestApp(supabase);

    const res = await app.request("/internal/health-check", {
      method: "POST",
      headers: { "x-internal-api-key": INTERNAL_KEY },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { checked: number; healthy: number };
    expect(body.checked).toBe(1);
    expect(body.healthy).toBe(1);

    const updates = getFakeUpdates(supabase).filter((u) => u.table === "endpoints");
    expect(updates[0]?.row).toMatchObject({ health_status: "healthy" });
  });
});
