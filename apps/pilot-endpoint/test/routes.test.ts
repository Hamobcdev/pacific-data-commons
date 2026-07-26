import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { healthRoute } from "../src/routes/free/health.js";
import { provenanceRoute } from "../src/routes/free/provenance.js";
import { integrityRoute } from "../src/routes/free/integrity.js";
import { schemaRoute } from "../src/routes/free/schema.js";
import { skillsAgentmarketRoute } from "../src/routes/free/skills-am.js";
import { skillsPdpRoute } from "../src/routes/free/skills-pdp.js";
import { sliceRoute } from "../src/routes/paid/slice.js";
import { errorHandlerMiddleware } from "../src/middleware/error-handler.js";
import type { AppBindings } from "../src/types.js";
import type { Env } from "../src/types/env.js";

/**
 * Free routes only, wired the same way src/index.ts wires them but without
 * constructing a PdcPaymentGate — that makes a real network call to the
 * facilitator on construction (see @pdc/x402-adapter's paymentMiddleware),
 * which does not belong in a unit test. 402-without-payment enforcement on
 * the 5 paid routes is verified by the live boot smoke test and
 * test/payment-client.ts against a running deployment, same as Session 2's
 * directory-api test suite treats full x402 flow as integration-level, not
 * unit-level.
 */
function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = {
    NODE_ENV: "test",
    ALGORAND_NETWORK: "testnet",
    AVM_ADDRESS: "TEST",
    FACILITATOR_URL: "https://facilitator.goplausible.xyz",
    PUBLIC_URL: "http://localhost:4021",
    LOG_LEVEL: "info",
  } as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    c.set("datasetHash", "a".repeat(64));
    c.set("hashComputedAt", "2026-01-01T00:00:00.000Z");
    await next();
  });

  app.route("/", healthRoute);
  app.route("/", provenanceRoute);
  app.route("/", integrityRoute);
  app.route("/", schemaRoute);
  app.route("/", skillsAgentmarketRoute);
  app.route("/", skillsPdpRoute);
  app.notFound((c) => c.json({ error: "not_found" }, 404));
  return app;
}

describe("free routes", () => {
  const freeRoutePaths = ["/health", "/provenance", "/integrity", "/schema", "/skills-agentmarket.json", "/skills-pdp.json"];

  it.each(freeRoutePaths)("GET %s returns 200 with JSON content-type", async (path) => {
    const app = buildTestApp();
    const res = await app.request(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("GET /health includes the canonical_hash field", async () => {
    const app = buildTestApp();
    const res = await app.request("/health");
    const body = (await res.json()) as { dataset: { canonical_hash: string } };
    expect(body.dataset.canonical_hash).toBe("a".repeat(64));
  });

  it("GET /integrity includes hash, algorithm, and records_count", async () => {
    const app = buildTestApp();
    const res = await app.request("/integrity");
    const body = (await res.json()) as { hash: string; algorithm: string; records_count: number };
    expect(body.hash).toBe("a".repeat(64));
    expect(body.algorithm).toBe("sha256");
    expect(body.records_count).toBe(18);
  });

  it("GET /schema includes pricing and record_schema", async () => {
    const app = buildTestApp();
    const res = await app.request("/schema");
    const body = (await res.json()) as { pricing: unknown; record_schema: unknown };
    expect(body.pricing).toBeDefined();
    expect(body.record_schema).toBeDefined();
  });

  it("GET /skills-agentmarket.json is valid JSON with an endpoints array", async () => {
    const app = buildTestApp();
    const res = await app.request("/skills-agentmarket.json");
    const body = (await res.json()) as { endpoints: unknown[] };
    expect(Array.isArray(body.endpoints)).toBe(true);
    expect(body.endpoints.length).toBeGreaterThan(0);
  });

  it("returns a structured 404 for an unmatched route", async () => {
    const app = buildTestApp();
    const res = await app.request("/nope");
    expect(res.status).toBe(404);
  });
});

/**
 * /slice's route handler and its query validation/filtering do not import
 * @pdc/x402-adapter — only src/index.ts's app composition gates it behind
 * payment. That means the HTTP-level 400 behaviour is fully testable here
 * without a live facilitator: mount the bare route + the same error handler
 * index.ts installs, with no payment gate in front of it at all.
 */
function buildSliceTestApp() {
  const app = new Hono<AppBindings>();
  const env = {
    NODE_ENV: "test",
    ALGORAND_NETWORK: "testnet",
    AVM_ADDRESS: "TEST",
    FACILITATOR_URL: "https://facilitator.goplausible.xyz",
    PUBLIC_URL: "http://localhost:4021",
    LOG_LEVEL: "info",
  } as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    c.set("datasetHash", "a".repeat(64));
    c.set("hashComputedAt", "2026-01-01T00:00:00.000Z");
    await next();
  });
  app.route("/", sliceRoute);
  app.onError(errorHandlerMiddleware);
  return app;
}

describe("GET /slice", () => {
  it("returns 400 for an invalid species parameter", async () => {
    const app = buildSliceTestApp();
    const res = await app.request("/slice?species=shark");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  it("returns 400 when year_start is after year_end", async () => {
    const app = buildSliceTestApp();
    const res = await app.request("/slice?year_start=2023&year_end=2018");
    expect(res.status).toBe(400);
  });

  it("returns only records matching valid filters", async () => {
    const app = buildSliceTestApp();
    const res = await app.request("/slice?species=skipjack&zone=samoa_eez");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ species: string; zone: string }> };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((r) => r.species === "skipjack" && r.zone === "samoa_eez")).toBe(true);
  });

  it("returns all 18 records when no filters are given", async () => {
    const app = buildSliceTestApp();
    const res = await app.request("/slice");
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(18);
  });

  it("always includes data_warning and matches /health's canonical hash", async () => {
    const app = buildSliceTestApp();
    const res = await app.request("/slice?species=bigeye");
    const body = (await res.json()) as { data_warning: string; provider: { provenance_hash: string } };
    expect(body.data_warning).toContain("SYNTHETIC");
    expect(body.provider.provenance_hash).toBe("a".repeat(64));
  });
});
