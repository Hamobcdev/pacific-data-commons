import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { samoaBankingSetupRoute } from "./samoa-banking-setup.js";
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

  app.route("/", samoaBankingSetupRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /pacific/samoa-banking-setup", () => {
  it("returns 200 with correct headers", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-banking-setup");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=86400, stale-while-revalidate=604800",
    );
    expect(res.headers.get("x-competition-tag")).toBe("x402-global-challenge");
  });

  it("returns banking details nested under banking_setup key", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-banking-setup");
    const body = (await res.json()) as {
      banking_setup: {
        licence_type: string;
        governing_legislation: string;
        regulator: string;
        minimum_paid_up_capital_usd: number;
        minimum_directors: number;
      };
      executive_summary: string;
      fetched_at: string;
      attribution: { source: string };
    };

    // All licence details are nested under banking_setup
    expect(body.banking_setup.licence_type).toBe("International Banking Licence");
    expect(body.banking_setup.governing_legislation).toContain("International Banking Act");
    expect(body.banking_setup.regulator).toBe("SIFA");

    // USD 1M minimum capital — International Banking Act 2005
    expect(body.banking_setup.minimum_paid_up_capital_usd).toBe(1_000_000);

    // 2 directors minimum
    expect(body.banking_setup.minimum_directors).toBe(2);

    expect(typeof body.executive_summary).toBe("string");
    expect(typeof body.fetched_at).toBe("string");
    expect(body.attribution.source).toContain("SIFA");
  });

  it("includes application_process with steps array", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-banking-setup");
    const body = (await res.json()) as {
      banking_setup: {
        application_process: {
          steps: Array<{ step: number; description: string; timeline: string }>;
          total_timeline_estimate: string;
        };
      };
    };

    // Steps are under banking_setup.application_process.steps (not top-level application_steps)
    expect(Array.isArray(body.banking_setup.application_process.steps)).toBe(true);
    expect(body.banking_setup.application_process.steps.length).toBeGreaterThan(0);

    for (const step of body.banking_setup.application_process.steps) {
      expect(typeof step.step).toBe("number");
      expect(typeof step.description).toBe("string");
      expect(typeof step.timeline).toBe("string");
    }

    expect(typeof body.banking_setup.application_process.total_timeline_estimate).toBe("string");
  });

  it("includes CBS and CBDC consultation notes for digital asset banking", async () => {
    const app = buildTestApp();
    const res = await app.request("/pacific/samoa-banking-setup");
    const body = (await res.json()) as {
      banking_setup: {
        cbs_consultation_note: string;
        cbdc_digital_asset_note: string;
      };
    };

    // No usdc_note field — split into cbs_consultation_note and cbdc_digital_asset_note
    expect(typeof body.banking_setup.cbs_consultation_note).toBe("string");
    expect(body.banking_setup.cbs_consultation_note.length).toBeGreaterThan(0);

    expect(typeof body.banking_setup.cbdc_digital_asset_note).toBe("string");
    expect(body.banking_setup.cbdc_digital_asset_note.length).toBeGreaterThan(0);
  });
});
