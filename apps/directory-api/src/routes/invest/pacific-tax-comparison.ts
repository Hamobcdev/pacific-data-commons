import { Hono } from "hono";
import { getTaxComparison, SOURCE_ATTRIBUTION, ALL_NATION_CODES, type NationCode } from "../../services/pacificInvestmentService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts ($0.30 — Decision 23 Bronze ceiling).
// Decision 60 $0.01 cap does NOT apply: SBP first-party synthesis layer
// (Decision 59) aggregating 6 national revenue authority sources.

export const pacificTaxComparisonRoute = new Hono<AppBindings>();

/**
 * GET /invest/pacific-tax-comparison
 * Side-by-side tax rates across Pacific nations: corporate tax, VAT/GST,
 * withholding tax, income tax, payroll levies, double tax agreements.
 * ?nations=ws,fj,vu,pg,to,sb (default: all)
 */
pacificTaxComparisonRoute.get("/invest/pacific-tax-comparison", (c) => {
  c.header("Cache-Control", "public, max-age=86400");
  c.header("X-Data-Currency", "2026-10");

  const nationsParam = c.req.query("nations");
  const codes = nationsParam
    ? (nationsParam.split(",").map((s) => s.trim().toLowerCase()) as NationCode[]).filter((code) =>
        (ALL_NATION_CODES as string[]).includes(code)
      )
    : undefined;

  const comparison = getTaxComparison(codes);

  return c.json({
    data: comparison,
    meta: {
      note: "Vanuatu is a zero-income-tax jurisdiction — unique in Pacific. Verify current rates with national revenue authority before filing.",
      data_currency: "October 2026",
      disclaimer: SOURCE_ATTRIBUTION.disclaimer,
      sources: SOURCE_ATTRIBUTION.sources,
      publisher: SOURCE_ATTRIBUTION.publisher,
    },
  });
});
