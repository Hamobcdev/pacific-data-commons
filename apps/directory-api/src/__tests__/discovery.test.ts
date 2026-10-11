import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { discoveryRoute } from "../routes/discovery.js";
import { AGENT_DATASET_CATALOG } from "../lib/agentDatasetCatalog.js";
import { paidRoutes } from "../routeSchemas.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { createFakeSupabase } from "./testUtils.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

function buildTestApp(supabase = createFakeSupabase({})) {
  const app = new Hono<AppBindings>();
  const env = {
    PUBLIC_URL: "https://api.synergybcpacific.com",
    ALGORAND_NETWORK: "mainnet",
    FACILITATOR_URL: "https://facilitator.goplausible.xyz",
  } as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    c.set("supabase", supabase);
    await next();
  });

  app.route("/", discoveryRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /.well-known/x402-directory.json", () => {
  it("lists every Agent Dataset Gateway dataset as a priced endpoint — GoPlausible bazaar indexing (Session 3)", async () => {
    const app = buildTestApp();
    const res = await app.request("/.well-known/x402-directory.json");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      endpoints: Array<{ path: string; full_url: string; method: string; price_usdc: number; pay_to: string | null; category: string }>;
    };

    expect(body.endpoints.length).toBe(AGENT_DATASET_CATALOG.length);
    expect(body.endpoints.length).toBe(22);

    for (const dataset of AGENT_DATASET_CATALOG) {
      const entry = body.endpoints.find((e) => e.path === dataset.path);
      expect(entry).toBeDefined();
      expect(entry?.price_usdc).toBe(dataset.priceUsdc);
      expect(entry?.pay_to).toBe(dataset.payToWallet ?? null);
      expect(entry?.full_url).toBe(`https://api.synergybcpacific.com${dataset.path}`);
    }
  });

  it("prices and wallets in the manifest never drift from paidRoutes — the actual payment-gate source of truth", async () => {
    const app = buildTestApp();
    const res = await app.request("/.well-known/x402-directory.json");
    const body = (await res.json()) as { endpoints: Array<{ path: string; price_usdc: number; pay_to: string | null }> };

    for (const entry of body.endpoints) {
      const route = paidRoutes.find((r) => r.path === entry.path && r.method === "GET");
      expect(route).toBeDefined();
      expect(entry.price_usdc).toBe(route?.priceUsdc);
      expect(entry.pay_to).toBe(route?.payToAddress ?? null);
    }
  });

  it("still exposes the pre-existing directory_endpoint and stats fields (additive change only)", async () => {
    const app = buildTestApp();
    const res = await app.request("/.well-known/x402-directory.json");
    const body = (await res.json()) as { directory_endpoint: { url: string }; stats: { active_providers: number; active_endpoints: number } };

    expect(body.directory_endpoint.url).toBe("https://api.synergybcpacific.com/search");
    expect(body.stats).toBeDefined();
  });
});
