import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { samoaGdpRoute } from "../routes/finance/samoa-gdp.js";
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

  app.route("/", samoaGdpRoute);
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

describe("GET /finance/samoa-gdp", () => {
  it("defaults to the latest fiscal year only, with the expected headers", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/samoa-gdp");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400, stale-while-revalidate=604800");
    expect(res.headers.get("x-data-source")).toBe("Samoa Bureau of Statistics");
    expect(res.headers.get("x-competition-tag")).toBe("x402-global-challenge");

    const body = (await res.json()) as {
      country: string;
      country_iso3: string;
      fiscal_years: Array<{ fiscal_year: string; gdp_nominal_sat_mil: number; real_growth_pct: number | null }>;
      latest: { fiscal_year: string; real_growth_pct: number | null };
      attribution: { source: string; data_quality: string };
    };

    expect(body.country).toBe("Samoa");
    expect(body.country_iso3).toBe("WSM");
    expect(body.fiscal_years).toHaveLength(1);
    expect(body.fiscal_years[0]).toMatchObject({ fiscal_year: "2025/26", gdp_nominal_sat_mil: 3619.8 });
    expect(body.latest).toMatchObject({ fiscal_year: "2025/26", real_growth_pct: -8.1 });
    expect(body.attribution.source).toBe("Samoa Bureau of Statistics");
    expect(body.attribution.data_quality).toBe("government_source_transcribed");
  });

  it("?all=true returns both published fiscal years", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/samoa-gdp?all=true");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { fiscal_years: Array<{ fiscal_year: string }> };
    expect(body.fiscal_years.map((fy) => fy.fiscal_year)).toEqual(["2025/26", "2024/25"]);
  });

  it("?fiscal_year=2024/25 filters to the prior-year comparator, with nulls for unpublished sub-fields", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/samoa-gdp?fiscal_year=2024%2F25");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      fiscal_years: Array<{ fiscal_year: string; gdp_nominal_sat_mil: number; real_growth_pct: number | null; fce: { total_real_growth_pct: number | null } }>;
    };
    expect(body.fiscal_years).toHaveLength(1);
    expect(body.fiscal_years[0]).toMatchObject({ fiscal_year: "2024/25", gdp_nominal_sat_mil: 3799.8, real_growth_pct: null });
    expect(body.fiscal_years[0]!.fce.total_real_growth_pct).toBeNull();
  });

  it("rejects an unsupported fiscal_year without touching the data layer", async () => {
    const app = buildTestApp();
    const res = await app.request("/finance/samoa-gdp?fiscal_year=1999%2F00");
    expect(res.status).toBe(400);
  });
});
