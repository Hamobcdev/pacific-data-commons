import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { samoaServiceProvidersRoute } from "./samoa-service-providers.js";
import { errorHandler, notFoundHandler } from "../../middleware/errorHandler.js";
import type { AppBindings } from "../../types.js";
import type { Env } from "../../lib/env.js";

function buildTestApp() {
  const app = new Hono<AppBindings>();
  const env = {} as Env;

  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });

  app.route("/", samoaServiceProvidersRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /pacific/samoa-service-providers", () => {
  it("returns 200 with correct headers", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-service-providers");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=86400, stale-while-revalidate=604800",
    );
    expect(res.headers.get("x-competition-tag")).toBe("x402-global-challenge");
  });

  it("returns SIFA as regulator (not regulatory_body)", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-service-providers");
    const body = (await res.json()) as {
      jurisdiction: string;
      regulator: string;
    };

    expect(body.regulator).toBe("SIFA");
    expect(body.jurisdiction).toBe("Samoa");
  });

  it("returns all 9 SIFA-licensed trustee companies", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-service-providers");
    const body = (await res.json()) as {
      total_licensed_trustee_companies: number;
      providers: Array<{
        name: string;
        address: string;
        specialisations: string[];
      }>;
    };

    // Field is total_licensed_trustee_companies, not provider_count
    expect(body.total_licensed_trustee_companies).toBe(9);
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.providers.length).toBe(9);

    // Each provider must have name and address at minimum
    for (const provider of body.providers) {
      expect(typeof provider.name).toBe("string");
      expect(provider.name.length).toBeGreaterThan(0);
      expect(typeof provider.address).toBe("string");
      expect(Array.isArray(provider.specialisations)).toBe(true);
    }
  });

  it("includes important_notice and law_firms_note fields", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-service-providers");
    const body = (await res.json()) as {
      important_notice: string;
      law_firms_note: string;
    };

    // Note: no listing_basis or disclosure_notice fields in response — those are route file comments
    expect(typeof body.important_notice).toBe("string");
    expect(body.important_notice.length).toBeGreaterThan(0);
    expect(typeof body.law_firms_note).toBe("string");
    expect(body.law_firms_note.length).toBeGreaterThan(0);
  });

  it("includes attribution with source referencing SIFA", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-service-providers");
    const body = (await res.json()) as {
      attribution: { source: string };
    };

    expect(body.attribution.source).toContain("SIFA");
  });

  it("includes fetched_at timestamp", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-service-providers");
    const body = (await res.json()) as { fetched_at: string };

    expect(typeof body.fetched_at).toBe("string");
    expect(body.fetched_at.length).toBeGreaterThan(0);
  });
});
