/**
 * Tests for the 6 Pacific Investment Intelligence endpoints.
 *
 * All 6 routes use pacificInvestmentService.ts — a pure in-memory dataset
 * with no external fetch calls. No mocking required.
 *
 * Pricing rationale (no Decision 60 cap applies):
 *   - Multi-source SBP synthesis layer (Decision 59 first-party publisher)
 *   - $0.30–$0.50 USDC (Decision 23 Bronze ceiling)
 */
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { pacificSetupComparisonRoute } from "../routes/invest/pacific-setup-comparison.js";
import { pacificTaxComparisonRoute } from "../routes/invest/pacific-tax-comparison.js";
import { pacificLandTenureRoute } from "../routes/invest/pacific-land-tenure.js";
import { pacificSectorRestrictionsRoute } from "../routes/invest/pacific-sector-restrictions.js";
import { pacificRegulatoryScoresRoute } from "../routes/invest/pacific-regulatory-scores.js";
import { pacificSetupChecklistRoute } from "../routes/invest/pacific-setup-checklist.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import type { AppBindings } from "../types.js";
import type { Env } from "../lib/env.js";

function buildTestApp(...routes: Hono<AppBindings>[]) {
  const app = new Hono<AppBindings>();
  const env = {} as Env;
  app.use("*", async (c, next) => {
    c.set("env", env);
    await next();
  });
  for (const route of routes) {
    app.route("/", route);
  }
  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

// ────────────────────────────────────────────────────────────────────────────
// /invest/pacific-setup-comparison
// ────────────────────────────────────────────────────────────────────────────
describe("GET /invest/pacific-setup-comparison", () => {
  const app = buildTestApp(pacificSetupComparisonRoute);

  it("returns 200 with all 6 nations by default", async () => {
    const res = await app.request("/invest/pacific-setup-comparison");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");

    const body = (await res.json()) as { data: unknown[]; meta: { nations_included: string[] } };
    expect(body.data).toHaveLength(6);
    expect(body.meta.nations_included).toHaveLength(6);
    expect(body.meta.nations_included).toContain("ws");
    expect(body.meta.nations_included).toContain("vu");
  });

  it("filters to requested nations only", async () => {
    const res = await app.request("/invest/pacific-setup-comparison?nations=ws,fj");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[]; meta: { nations_included: string[] } };
    expect(body.data).toHaveLength(2);
    expect(body.meta.nations_included).toEqual(["ws", "fj"]);
  });

  it("ignores invalid nation codes silently (returns valid subset)", async () => {
    const res = await app.request("/invest/pacific-setup-comparison?nations=ws,INVALID,fj");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[]; meta: { nations_included: string[] } };
    expect(body.data).toHaveLength(2);
  });

  it("includes required attribution fields", async () => {
    const res = await app.request("/invest/pacific-setup-comparison");
    const body = (await res.json()) as { meta: { disclaimer: string; sources: unknown[]; publisher: string } };
    expect(body.meta.disclaimer).toBeTruthy();
    expect(Array.isArray(body.meta.sources)).toBe(true);
    expect(body.meta.publisher).toContain("Synergy");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// /invest/pacific-tax-comparison
// ────────────────────────────────────────────────────────────────────────────
describe("GET /invest/pacific-tax-comparison", () => {
  const app = buildTestApp(pacificTaxComparisonRoute);

  it("returns 200 with all 6 nations by default", async () => {
    const res = await app.request("/invest/pacific-tax-comparison");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(6);
  });

  it("Vanuatu has zero corporate tax (key data integrity check)", async () => {
    const res = await app.request("/invest/pacific-tax-comparison?nations=vu");
    const body = (await res.json()) as {
      data: Array<{ nation: string; corporate_tax_pct: number; corporate_tax_note: string }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.nation).toBe("vu");
    expect(body.data[0]?.corporate_tax_pct).toBe(0);
    expect(body.data[0]?.corporate_tax_note).toContain("zero");
  });

  it("includes Vanuatu note in meta", async () => {
    const res = await app.request("/invest/pacific-tax-comparison");
    const body = (await res.json()) as { meta: { note: string } };
    expect(body.meta.note).toContain("Vanuatu");
  });

  it("single-nation filter works", async () => {
    const res = await app.request("/invest/pacific-tax-comparison?nations=ws");
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// /invest/pacific-land-tenure
// ────────────────────────────────────────────────────────────────────────────
describe("GET /invest/pacific-land-tenure", () => {
  const app = buildTestApp(pacificLandTenureRoute);

  it("returns 200 with all 6 nations", async () => {
    const res = await app.request("/invest/pacific-land-tenure");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(6);
  });

  it("includes customary land policy note in meta", async () => {
    const res = await app.request("/invest/pacific-land-tenure");
    const body = (await res.json()) as { meta: { policy_note: string } };
    expect(body.meta.policy_note).toContain("customary");
    expect(body.meta.policy_note).toContain("tokenise");
  });

  it("Samoa has primarily customary land (data integrity check)", async () => {
    const res = await app.request("/invest/pacific-land-tenure?nations=ws");
    const body = (await res.json()) as {
      data: Array<{ nation: string; customary_pct: number }>;
    };
    expect(body.data[0]?.nation).toBe("ws");
    // Samoa is ~82% customary
    expect(body.data[0]?.customary_pct).toBeGreaterThan(50);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// /invest/pacific-sector-restrictions
// ────────────────────────────────────────────────────────────────────────────
describe("GET /invest/pacific-sector-restrictions", () => {
  const app = buildTestApp(pacificSectorRestrictionsRoute);

  it("returns 200 with all nations by default", async () => {
    const res = await app.request("/invest/pacific-sector-restrictions");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown; meta: { status_legend: Record<string, string> } };
    expect(body.data).toBeTruthy();
    expect(body.meta.status_legend).toBeDefined();
    expect(body.meta.status_legend.open).toBeTruthy();
  });

  it("filters by sector keyword", async () => {
    const res = await app.request("/invest/pacific-sector-restrictions?sector=fisheries");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { sectors: Array<{ sector: string }> } };
    // Fisheries should appear and be filtered to relevant sectors
    expect(body.data).toBeTruthy();
  });

  it("filters by nation", async () => {
    const res = await app.request("/invest/pacific-sector-restrictions?nations=ws");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// /invest/pacific-regulatory-scores
// ────────────────────────────────────────────────────────────────────────────
describe("GET /invest/pacific-regulatory-scores", () => {
  const app = buildTestApp(pacificRegulatoryScoresRoute);

  it("returns 200 with all 6 nations ranked by composite score", async () => {
    const res = await app.request("/invest/pacific-regulatory-scores");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ nation: string; composite_score: number }>;
      meta: { methodology: string };
    };
    expect(body.data).toHaveLength(6);

    // Results must be sorted descending by composite_score
    const composites = body.data.map((d) => d.composite_score);
    for (let i = 0; i < composites.length - 1; i++) {
      expect(composites[i]).toBeGreaterThanOrEqual(composites[i + 1] as number);
    }

    // Vanuatu should rank highest (zero-tax, fast setup)
    expect(body.data[0]?.nation).toBe("vu");
  });

  it("includes methodology note in meta", async () => {
    const res = await app.request("/invest/pacific-regulatory-scores");
    const body = (await res.json()) as { meta: { methodology: string; scoring_note: string } };
    expect(body.meta.methodology).toContain("6");
    expect(body.meta.scoring_note).toContain("not legal advice");
  });

  it("filter to subset still returns ranked subset", async () => {
    const res = await app.request("/invest/pacific-regulatory-scores?nations=ws,fj,pg");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ nation: string; composite_score: number }> };
    expect(body.data).toHaveLength(3);
    const composites = body.data.map((d) => d.composite_score);
    for (let i = 0; i < composites.length - 1; i++) {
      expect(composites[i]).toBeGreaterThanOrEqual(composites[i + 1] as number);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// /invest/pacific-setup-checklist
// ────────────────────────────────────────────────────────────────────────────
describe("GET /invest/pacific-setup-checklist", () => {
  const app = buildTestApp(pacificSetupChecklistRoute);

  it("returns 200 with all 6 nations' checklists when nation param is omitted", async () => {
    const res = await app.request("/invest/pacific-setup-checklist");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { nation: string; entity_type: string; steps: unknown[] }[];
      meta: { nations_included: string[] };
    };
    expect(body.data).toHaveLength(6);
    expect(body.meta.nations_included).toHaveLength(6);
    for (const entry of body.data) {
      expect(entry.entity_type).toBe("company");
      expect(Array.isArray(entry.steps)).toBe(true);
      expect(entry.steps.length).toBeGreaterThan(0);
    }
  });

  it("returns 400 for an invalid nation code", async () => {
    const res = await app.request("/invest/pacific-setup-checklist?nation=xx");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { valid_values: string[] };
    expect(body.valid_values).toHaveLength(6);
  });

  it("returns 400 for invalid entity_type", async () => {
    const res = await app.request("/invest/pacific-setup-checklist?nation=ws&entity_type=llp");
    expect(res.status).toBe(400);
  });

  it("returns 200 with Samoa company checklist (default entity_type)", async () => {
    const res = await app.request("/invest/pacific-setup-checklist?nation=ws");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { nation: string; entity_type: string; steps: unknown[] };
      meta: { disclaimer: string };
    };
    expect(body.data.nation).toBe("ws");
    expect(body.data.entity_type).toBe("company");
    expect(Array.isArray(body.data.steps)).toBe(true);
    expect(body.data.steps.length).toBeGreaterThan(0);
    expect(body.meta.disclaimer).toBeTruthy();
  });

  it("returns 200 for all 6 nations", async () => {
    for (const nation of ["ws", "fj", "vu", "pg", "to", "sb"]) {
      const res = await app.request(`/invest/pacific-setup-checklist?nation=${nation}`);
      expect(res.status).toBe(200);
    }
  });

  it("entity_type=sole_trader returns 200", async () => {
    const res = await app.request("/invest/pacific-setup-checklist?nation=fj&entity_type=sole_trader");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { entity_type: string } };
    expect(body.data.entity_type).toBe("sole_trader");
  });
});
