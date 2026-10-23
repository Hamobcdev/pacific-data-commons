import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { agentDiscoveryRoute } from "../routes/agentDiscovery.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = {} as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });

  app.route("/", agentDiscoveryRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GoPlausible agent discovery files", () => {
  it("GET /.well-known/agent-card.json returns 200, application/json, CORS, and the expected skills", async () => {
    const app = buildTestApp();
    const res = await app.request("/.well-known/agent-card.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");

    const body = (await res.json()) as { name: string; skills: Array<{ id: string }> };
    expect(body.name).toBe("Pacific Data Commons");
    expect(body.skills.map((s) => s.id)).toEqual(["pacific-intelligence", "pacific-travel", "pacific-fx", "jurisdiction-intelligence"]);
  });

  it("GET /.well-known/mcp.json returns 200, application/json, CORS, and the x402 payment block", async () => {
    const app = buildTestApp();
    const res = await app.request("/.well-known/mcp.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");

    const body = (await res.json()) as { name: string; payments: { protocol: string; asset_id: string }; tools: Array<{ name: string }> };
    expect(body.name).toBe("Pacific Data Commons MCP");
    expect(body.payments.protocol).toBe("x402");
    expect(body.payments.asset_id).toBe("31566704");
    expect(body.tools.length).toBe(5);
  });

  it("GET /llms.txt returns 200, text/plain, CORS, and mentions the directory manifest", async () => {
    const app = buildTestApp();
    const res = await app.request("/llms.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");

    const body = await res.text();
    expect(body).toContain("# Pacific Data Commons");
    expect(body).toContain("https://api.synergybcpacific.com/.well-known/x402-directory.json");
  });

  it("GET /agents.md returns 200, text/markdown, CORS, and the payment flow steps", async () => {
    const app = buildTestApp();
    const res = await app.request("/agents.md");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");

    const body = await res.text();
    expect(body).toContain("## Payment flow");
    expect(body).toContain("PAYMENT-REQUIRED");
  });

  it("responds to OPTIONS on all four paths with 204 and CORS headers", async () => {
    const app = buildTestApp();
    for (const path of ["/.well-known/agent-card.json", "/.well-known/mcp.json", "/llms.txt", "/agents.md"]) {
      const res = await app.request(path, { method: "OPTIONS" });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    }
  });
});
