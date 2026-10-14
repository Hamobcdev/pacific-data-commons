import { Hono } from "hono";
import { getSetupComparison, SOURCE_ATTRIBUTION, ALL_NATION_CODES, type NationCode } from "../../services/pacificInvestmentService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts ($0.50 — Decision 23 Bronze ceiling).
// Decision 60 $0.01 cap does NOT apply: SBP first-party synthesis layer
// (Decision 59) aggregating 6 national investment authority sources.

export const pacificSetupComparisonRoute = new Hono<AppBindings>();

/**
 * GET /invest/pacific-setup-comparison
 * Structured comparison of business setup requirements across 6 Pacific nations.
 * ?nations=ws,fj,vu,pg,to,sb (default: all)
 */
pacificSetupComparisonRoute.get("/invest/pacific-setup-comparison", (c) => {
  c.header("Cache-Control", "public, max-age=86400");
  c.header("X-Data-Currency", "2026-10");

  const nationsParam = c.req.query("nations");
  const codes = nationsParam
    ? (nationsParam.split(",").map((s) => s.trim().toLowerCase()) as NationCode[]).filter((code) =>
        (ALL_NATION_CODES as string[]).includes(code)
      )
    : undefined;

  const comparison = getSetupComparison(codes);

  return c.json({
    data: comparison,
    meta: {
      nations_included: comparison.map((n) => n.nation),
      data_currency: "October 2026",
      disclaimer: SOURCE_ATTRIBUTION.disclaimer,
      sources: SOURCE_ATTRIBUTION.sources,
      publisher: SOURCE_ATTRIBUTION.publisher,
    },
  });
});
