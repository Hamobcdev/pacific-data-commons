import { Hono } from "hono";
import { getSectorRestrictions, SOURCE_ATTRIBUTION, ALL_NATION_CODES, type NationCode } from "../../services/pacificInvestmentService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts ($0.40 — Decision 23 Bronze ceiling).
// Decision 60 $0.01 cap does NOT apply: SBP first-party synthesis layer
// (Decision 59) aggregating 6 national investment authority regulatory matrices.

export const pacificSectorRestrictionsRoute = new Hono<AppBindings>();

/**
 * GET /invest/pacific-sector-restrictions
 * By-sector matrix of foreign investment restrictions across Pacific nations.
 * ?sector=fisheries|tourism|retail|construction (optional keyword filter)
 * ?nations=ws,fj,vu,pg,to,sb (default: all)
 */
pacificSectorRestrictionsRoute.get("/invest/pacific-sector-restrictions", (c) => {
  c.header("Cache-Control", "public, max-age=86400");
  c.header("X-Data-Currency", "2026-10");

  const sectorParam = c.req.query("sector");
  const nationsParam = c.req.query("nations");
  const codes = nationsParam
    ? (nationsParam.split(",").map((s) => s.trim().toLowerCase()) as NationCode[]).filter((code) =>
        (ALL_NATION_CODES as string[]).includes(code)
      )
    : undefined;

  const result = getSectorRestrictions(sectorParam ?? undefined, codes);

  return c.json({
    data: result,
    meta: {
      status_legend: {
        reserved_citizens_only: "Sector is fully reserved for domestic/national citizens — foreign investment prohibited",
        restricted_equity_cap: "Foreign equity permitted up to stated cap — joint venture structure common",
        restricted_jv_required: "Foreign investment permitted only via joint venture with local partner",
        requires_approval: "Foreign investment permitted but requires specific ministerial/authority approval",
        open: "Sector open to 100% foreign ownership (subject to standard FIC/registration requirements)",
      },
      data_currency: "October 2026",
      disclaimer: SOURCE_ATTRIBUTION.disclaimer,
      sources: SOURCE_ATTRIBUTION.sources,
      publisher: SOURCE_ATTRIBUTION.publisher,
    },
  });
});
