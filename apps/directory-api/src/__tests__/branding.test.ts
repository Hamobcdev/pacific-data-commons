import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { brandingRoute } from "../routes/branding.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = { PUBLIC_URL: "https://api.synergybcpacific.com" } as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });

  app.route("/", brandingRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET / (branding/og meta)", () => {
  it("returns the updated og:title, og:description, og:site_name, and theme-color when Accept includes text/html", async () => {
    const app = buildTestApp();
    const res = await app.request("/", { headers: { Accept: "text/html" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain('<meta property="og:title" content="Pacific Data Commons — Sovereign Pacific Data on x402">');
    expect(html).toContain("36 live x402-paid endpoints serving Pacific economic, climate, fisheries, jurisdiction, and intelligence data");
    expect(html).toContain('<meta property="og:site_name" content="Pacific Data Commons">');
    expect(html).toContain('<meta name="theme-color" content="#2EE6C5">');
  });

  it("falls through to the 404 JSON handler when Accept does not include text/html", async () => {
    const app = buildTestApp();
    const res = await app.request("/", { headers: { Accept: "application/json" } });
    expect(res.status).toBe(404);
  });
});
