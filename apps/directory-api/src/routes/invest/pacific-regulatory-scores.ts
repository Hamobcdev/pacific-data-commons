import { Hono } from "hono";
import { getRegulatoryScores, SOURCE_ATTRIBUTION, ALL_NATION_CODES, type NationCode } from "../../services/pacificInvestmentService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts ($0.50 — Decision 23 Bronze ceiling).
// Decision 60 $0.01 cap does NOT apply: proprietary SBP scoring model is
// SBP-authored IP, not a wrapper of a single external open API.

export const pacificRegulatoryScoresRoute = new Hono<AppBindings>();

/**
 * GET /invest/pacific-regulatory-scores
 * Proprietary SBP regulatory ease scores for Pacific nations across 6 dimensions.
 * Ranked output — highest composite score first.
 * ?nations=ws,fj,vu,pg,to,sb (default: all, ranked by composite score DESC)
 */
pacificRegulatoryScoresRoute.get("/invest/pacific-regulatory-scores", (c) => {
  c.header("Cache-Control", "public, max-age=86400");
  c.header("X-Data-Currency", "2026-10");

  const nationsParam = c.req.query("nations");
  const codes = nationsParam
    ? (nationsParam.split(",").map((s) => s.trim().toLowerCase()) as NationCode[]).filter((code) =>
        (ALL_NATION_CODES as string[]).includes(code)
      )
    : undefined;

  const scores = getRegulatoryScores(codes);

  return c.json({
    data: scores,
    meta: {
      methodology:
        "6 equally-weighted dimensions, 1–10 scale, composite is arithmetic mean. Scores reflect SBP structured assessment of official October 2026 regulatory data. NOT a ranking of investment attractiveness — each nation's advantage varies by sector and investor profile.",
      scoring_note:
        "These scores are SBP's structured synthesis layer, not legal advice or investment recommendations. A high composite score does not guarantee smooth market entry — on-the-ground conditions vary.",
      data_currency: "October 2026",
      disclaimer: SOURCE_ATTRIBUTION.disclaimer,
      sources: SOURCE_ATTRIBUTION.sources,
      publisher: SOURCE_ATTRIBUTION.publisher,
    },
  });
});
