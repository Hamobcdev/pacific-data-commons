import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { psrRoute } from "../routes/psr.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";

function buildTestApp() {
  const app = new Hono<AppBindings>();
  app.route("/", psrRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /psr/v1/spec", () => {
  it("returns the PSR specification with the correct revenue split and pricing (CLAUDE.md v2.2)", async () => {
    const app = buildTestApp();
    const res = await app.request("/psr/v1/spec");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    const body = (await res.json()) as {
      psr_version: string;
      pricing: { directory_query_fee_usdc: number; provider_share_pct: number; sbp_share_pct: number; bronze_tier_cap_usdc: number };
      interoperability: { sbp_holds_data: boolean; sbp_holds_funds: boolean };
    };
    expect(body.psr_version).toBe("1.0.0");
    expect(body.pricing.directory_query_fee_usdc).toBe(0.01);
    expect(body.pricing.provider_share_pct).toBe(97);
    expect(body.pricing.sbp_share_pct).toBe(3);
    expect(body.pricing.bronze_tier_cap_usdc).toBe(0.5);
    expect(body.interoperability.sbp_holds_data).toBe(false);
    expect(body.interoperability.sbp_holds_funds).toBe(false);
  });
});

describe("GET /psr/v1/spec ecosystem registry (Session 38)", () => {
  it("includes the ecosystem_summary and platform_nodes extension", async () => {
    const app = buildTestApp();
    const res = await app.request("/psr/v1/spec");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ecosystem_summary: { total_nodes: number; registry_version: string; sbp_fee_pct_all_nodes: number };
      platform_nodes: Array<{ node_id: string }>;
    };
    expect(body.ecosystem_summary.total_nodes).toBe(8);
    expect(body.ecosystem_summary.registry_version).toBe("1.1.0");
    expect(body.ecosystem_summary.sbp_fee_pct_all_nodes).toBe(3);
    expect(body.platform_nodes).toHaveLength(8);
    expect(body.platform_nodes.map((n) => n.node_id)).toContain("pdc-mainnet");
  });
});

describe("GET /psr/v1/nodes", () => {
  it("returns all 8 platform nodes with cache headers", async () => {
    const app = buildTestApp();
    const res = await app.request("/psr/v1/nodes");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    const body = (await res.json()) as {
      registry_version: string;
      platform_nodes: Array<{ node_id: string; node_name: string; cbs_read_access: boolean }>;
    };
    expect(body.registry_version).toBe("1.1.0");
    expect(body.platform_nodes).toHaveLength(8);
    const pdc = body.platform_nodes.find((n) => n.node_id === "pdc-mainnet");
    expect(pdc?.node_name).toBe("Pacific Data Commons");
    expect(pdc?.cbs_read_access).toBe(true);
  });
});

describe("GET /psr/v1/schema", () => {
  it("returns the PSR endpoint schema covering the mandatory sovereignty and pricing fields", async () => {
    const app = buildTestApp();
    const res = await app.request("/psr/v1/schema");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    const body = (await res.json()) as { required: string[]; properties: Record<string, unknown> };
    expect(body.required).toContain("payment_address");
    expect(body.required).toContain("trust_tier");
    expect(body.properties).toHaveProperty("indigenous_data_flag");
    expect(body.properties).toHaveProperty("cultural_sensitivity");
    expect(body.properties).toHaveProperty("cultural_sovereignty_price_floor");
  });
});
