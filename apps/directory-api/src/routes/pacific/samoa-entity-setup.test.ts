import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { samoaEntitySetupRoute } from "./samoa-entity-setup.js";
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

  app.route("/", samoaEntitySetupRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /pacific/samoa-entity-setup", () => {
  it("returns 200 with all 7 entity types when no entity_type param given", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-entity-setup");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=86400, stale-while-revalidate=604800",
    );
    expect(res.headers.get("x-competition-tag")).toBe("x402-global-challenge");

    const body = (await res.json()) as {
      query: { entity_type: string };
      results: Array<{ entity_type: string }>;
      aml_cfct_mandatory_notice: string;
      next_step_notice: string;
      attribution: { source: string };
    };

    expect(body.query.entity_type).toBe("all");
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBe(7); // ibc, trust, foundation, international_bank, insurance, partnership, mutual_fund

    const entityTypes = body.results.map((r) => r.entity_type);
    expect(entityTypes).toContain("ibc");
    expect(entityTypes).toContain("trust");
    expect(entityTypes).toContain("foundation");
    expect(entityTypes).toContain("international_bank");

    expect(body.aml_cfct_mandatory_notice).toContain("25%");
    expect(body.attribution.source).toContain("SIFA");
  });

  it("returns 200 with ibc entity details when entity_type=ibc", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-entity-setup?entity_type=ibc");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      query: { entity_type: string };
      results: Array<{
        entity_type: string;
        governing_legislation: string;
        minimum_paid_up_capital_usd: number | null;
        ubo_disclosure_threshold_pct: number;
        ubo_disclosure_public: boolean;
        tax_treatment: string;
      }>;
    };

    expect(body.query.entity_type).toBe("ibc");
    expect(body.results.length).toBe(1);
    const ibc = body.results[0]!;
    expect(ibc.governing_legislation).toContain("International Companies Act");
    expect(ibc.ubo_disclosure_threshold_pct).toBe(25);
    expect(ibc.ubo_disclosure_public).toBe(false);
    expect(ibc.tax_treatment.toLowerCase()).toContain("exempt");
  });

  it("returns 200 with international_bank details including USD 1M capital", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-entity-setup?entity_type=international_bank");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      query: { entity_type: string };
      results: Array<{ entity_type: string; minimum_paid_up_capital_usd: number }>;
    };

    expect(body.query.entity_type).toBe("international_bank");
    expect(body.results[0]!.minimum_paid_up_capital_usd).toBe(1_000_000);
  });

  it("returns 200 with all results when entity_type=all (explicit)", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-entity-setup?entity_type=all");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { query: { entity_type: string }; results: unknown[] };
    expect(body.query.entity_type).toBe("all");
    expect(body.results.length).toBe(7);
  });

  it("returns 400 for an unrecognised entity_type", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-entity-setup?entity_type=bogus");
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("invalid_entity_type");
    expect(body.message).toContain("bogus");
  });
});
