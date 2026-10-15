import { Hono } from "hono";
import { getLandTenureComparison, SOURCE_ATTRIBUTION, ALL_NATION_CODES, type NationCode } from "../../services/pacificInvestmentService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts ($0.30 — Decision 23 Bronze ceiling).
// Decision 60 $0.01 cap does NOT apply: SBP first-party synthesis layer
// (Decision 59) aggregating 6 national land authority sources.
//
// PERMANENT POLICY: Customary land and traditional fishing rights are
// EXCLUDED from all collateral/tokenisation per SBP policy (CLAUDE.md hard rules).
// This endpoint provides information only.

export const pacificLandTenureRoute = new Hono<AppBindings>();

/**
 * GET /invest/pacific-land-tenure
 * Land tenure system comparison across Pacific nations — customary vs freehold
 * vs government percentages, lease terms, foreign ownership rules, land boards.
 * ?nations=ws,fj,vu,pg,to,sb (default: all)
 */
pacificLandTenureRoute.get("/invest/pacific-land-tenure", (c) => {
  c.header("Cache-Control", "public, max-age=86400");
  c.header("X-Data-Currency", "2026-10");

  const nationsParam = c.req.query("nations");
  const codes = nationsParam
    ? (nationsParam.split(",").map((s) => s.trim().toLowerCase()) as NationCode[]).filter((code) =>
        (ALL_NATION_CODES as string[]).includes(code)
      )
    : undefined;

  const comparison = getLandTenureComparison(codes);

  return c.json({
    data: comparison,
    meta: {
      policy_note:
        "Customary land and traditional fishing rights are information only. SBP does not facilitate, tokenise, or collateralise customary land. Consult national land authority and qualified Pacific legal counsel before any land transaction.",
      data_currency: "October 2026",
      disclaimer: SOURCE_ATTRIBUTION.disclaimer,
      sources: SOURCE_ATTRIBUTION.sources,
      publisher: SOURCE_ATTRIBUTION.publisher,
    },
  });
});
