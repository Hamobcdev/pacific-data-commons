import { Hono } from "hono";
import nacl from "tweetnacl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentDatasetGatewayRoute } from "../routes/agentDatasetGateway.js";
import { __resetSamoaCpiCacheForTests } from "../services/samoaCpiService.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { encodeAlgorandAddress } from "../lib/algorandAttestation.js";
import { createFakeSupabase } from "./testUtils.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

const LEVEL_URL_PREFIX = "https://api.worldbank.org/v2/country/WSM/indicator/FP.CPI.TOTL?";
const INFLATION_URL_PREFIX = "https://api.worldbank.org/v2/country/WSM/indicator/FP.CPI.TOTL.ZG?";

function worldBankResponse(indicatorId: string, observations: Array<{ date: string; value: number | null }>) {
  return [
    { page: 1, pages: 1, per_page: observations.length, total: observations.length, sourceid: "2", lastupdated: "2026-07-13" },
    observations.map((o) => ({ indicator: { id: indicatorId, value: "x" }, country: { id: "WS", value: "Samoa" }, countryiso3code: "WSM", date: o.date, value: o.value, unit: "", obs_status: "", decimal: 1 })),
  ];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubWorldBankFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith(LEVEL_URL_PREFIX)) return jsonResponse(worldBankResponse("FP.CPI.TOTL", [{ date: "2025", value: 149.24 }]));
      if (url.startsWith(INFLATION_URL_PREFIX)) return jsonResponse(worldBankResponse("FP.CPI.TOTL.ZG", [{ date: "2025", value: 2.21 }]));
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

function knownWallet(): string {
  const keyPair = nacl.sign.keyPair();
  return encodeAlgorandAddress(keyPair.publicKey);
}

function buildTestApp(supabase: ReturnType<typeof createFakeSupabase>) {
  const app = new Hono<AppBindings>();
  const env = {} as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    c.set("supabase", supabase);
    await next();
  });

  app.route("/", agentDatasetGatewayRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /api/v1/datasets", () => {
  it("lists the catalog with samoa-cpi marked queryable and others not", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/api/v1/datasets");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { datasets: Array<{ dataset_id: string; queryable: boolean; query_endpoint: string | null }> };
    const samoaCpi = body.datasets.find((d) => d.dataset_id === "samoa-cpi");
    expect(samoaCpi?.queryable).toBe(true);
    expect(samoaCpi?.query_endpoint).toBe("/api/v1/datasets/samoa-cpi/query");

    const fx = body.datasets.find((d) => d.dataset_id === "fx");
    expect(fx?.queryable).toBe(false);
    expect(fx?.query_endpoint).toBeNull();

    // directory/meta routes are excluded from the dataset catalog
    expect(body.datasets.find((d) => d.dataset_id === "search")).toBeUndefined();
  });
});

describe("GET /api/v1/manifests/:id", () => {
  it("returns a manifest for a known dataset", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/api/v1/manifests/samoa-cpi");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { dataset_id: string; queryable: boolean; provenance: { data_currency: string } };
    expect(body.dataset_id).toBe("samoa-cpi");
    expect(body.queryable).toBe(true);
    expect(body.provenance.data_currency).toBe("annual");
  });

  it("404s for an unknown dataset id", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/api/v1/manifests/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/datasets/:id/query", () => {
  beforeEach(() => {
    __resetSamoaCpiCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetSamoaCpiCacheForTests();
  });

  it("400s when X-Agent-Wallet header is missing", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/api/v1/datasets/samoa-cpi/query", { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("400s when X-Agent-Wallet is not a valid Algorand address", async () => {
    const app = buildTestApp(createFakeSupabase({}));
    const res = await app.request("/api/v1/datasets/samoa-cpi/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": "not-a-wallet" },
    });
    expect(res.status).toBe(400);
  });

  it("403s when the wallet is well-formed but not a registered agent", async () => {
    const app = buildTestApp(createFakeSupabase({ agents: { data: [] } }));
    const res = await app.request("/api/v1/datasets/samoa-cpi/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": knownWallet() },
    });
    expect(res.status).toBe(403);
  });

  it("501s for a dataset in the catalog that isn't wired into the query adapter yet", async () => {
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));
    const res = await app.request("/api/v1/datasets/fx/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet },
    });
    expect(res.status).toBe(501);
  });

  it("404s for a dataset id that isn't in the catalog at all", async () => {
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));
    const res = await app.request("/api/v1/datasets/not-a-real-dataset/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet },
    });
    expect(res.status).toBe(404);
  });

  it("200s for samoa-cpi with a known agent wallet, wrapping the result in a provenance envelope", async () => {
    stubWorldBankFetch();
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));

    const res = await app.request("/api/v1/datasets/samoa-cpi/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet, "content-type": "application/json" },
      body: JSON.stringify({ params: { years: 5 } }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      dataset_id: string;
      agent_wallet: string;
      provenance: { data_currency: string; upstream_source: string };
      result: { country: string; observations: unknown[] };
    };
    expect(body.dataset_id).toBe("samoa-cpi");
    expect(body.agent_wallet).toBe(wallet);
    expect(body.provenance.data_currency).toBe("annual");
    expect(body.result.country).toBe("Samoa");
  });

  it("200s with no body at all (years defaults to 15)", async () => {
    stubWorldBankFetch();
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));

    const res = await app.request("/api/v1/datasets/samoa-cpi/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet },
    });
    expect(res.status).toBe(200);
  });

  it("400s on an out-of-range years param, same bound as the direct route", async () => {
    const wallet = knownWallet();
    const app = buildTestApp(createFakeSupabase({ agents: { data: [{ id: "agent-1", operational_wallet: wallet }] } }));

    const res = await app.request("/api/v1/datasets/samoa-cpi/query", {
      method: "POST",
      headers: { "X-Agent-Wallet": wallet, "content-type": "application/json" },
      body: JSON.stringify({ params: { years: 0 } }),
    });
    expect(res.status).toBe(400);
  });
});
