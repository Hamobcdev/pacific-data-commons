import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { fijiGdpRoute } from "./fiji-gdp.js";
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

  app.route("/", fijiGdpRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /finance/fiji-gdp", () => {
  it("returns 200 with the full industry breakdown for year=2019, with the expected headers", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/fiji-gdp?year=2019");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400, stale-while-revalidate=604800");
    expect(res.headers.get("x-data-source")).toBe("Fiji Bureau of Statistics");
    expect(res.headers.get("x-competition-tag")).toBe("x402-global-challenge");

    const body = (await res.json()) as {
      nation: string;
      source_institution: string;
      base_year: number;
      measure: string;
      data: { year: string; detail_level: string; industries: { total: number; agriculture_forestry_fishing: number } };
      attribution: { source: string; data_quality: string };
    };

    expect(body.nation).toBe("FJ");
    expect(body.source_institution).toBe("Fiji Bureau of Statistics");
    expect(body.base_year).toBe(2019);
    expect(body.measure).toBe("nominal");
    expect(body.data.detail_level).toBe("full_industry_breakdown");
    expect(body.data.industries.total).toBe(11547.1);
    expect(body.data.industries.agriculture_forestry_fishing).toBe(748.2);
    expect(body.attribution.source).toBe("Fiji Bureau of Statistics");
    expect(body.attribution.data_quality).toBe("government_source_transcribed");
  });

  it("returns 200 with total-only data and a preliminary flag for year=2024", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/fiji-gdp?year=2024");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { year: string; detail_level: string; total: number; real_growth_pct: number; preliminary: boolean } };
    expect(body.data.detail_level).toBe("total_only");
    expect(body.data.total).toBe(13537.5);
    expect(body.data.real_growth_pct).toBe(3.5);
    expect(body.data.preliminary).toBe(true);
  });

  it("?measure=real_growth returns the real growth rate for a total-only year", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/fiji-gdp?year=2022&measure=real_growth");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { measure: string; data: { year: string; real_growth_pct: number | null } };
    expect(body.measure).toBe("real_growth");
    expect(body.data.real_growth_pct).toBe(17.7);
  });

  it("?measure=real_growth for the base year 2019 returns null with an explanatory note, not a fabricated value", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/fiji-gdp?year=2019&measure=real_growth");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { real_growth_pct: number | null; note?: string } };
    expect(body.data.real_growth_pct).toBeNull();
    expect(body.data.note).toBeTruthy();
  });

  it("returns 400 when year is missing", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/fiji-gdp");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("required");
  });

  it("returns 400 for a year outside the supported 2019-2024 range", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/fiji-gdp?year=2018");
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unrecognised measure", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/fiji-gdp?year=2019&measure=bogus");
    expect(res.status).toBe(400);
  });
});
