import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { financialRailsAuth } from "../middleware/financialRailsAuth.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = { FINANCIAL_RAILS_KEY: "test-secret" } as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });
  app.use("/protected", financialRailsAuth);
  app.get("/protected", (c) => c.json({ ok: true }));
  app.get("/health", (c) => c.json({ status: "ok", service: "sbp-financial-rails", stub: true }));
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("financialRailsAuth", () => {
  it("allows /health with no auth header", async () => {
    const app = buildTestApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stub: boolean };
    expect(body.stub).toBe(true);
  });

  it("rejects a protected route with no Authorization header", async () => {
    const app = buildTestApp();
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
  });

  it("rejects a protected route with the wrong key", async () => {
    const app = buildTestApp();
    const res = await app.request("/protected", { headers: { authorization: "Bearer wrong-key" } });
    expect(res.status).toBe(401);
  });

  it("allows a protected route with the correct key", async () => {
    const app = buildTestApp();
    const res = await app.request("/protected", { headers: { authorization: "Bearer test-secret" } });
    expect(res.status).toBe(200);
  });
});
