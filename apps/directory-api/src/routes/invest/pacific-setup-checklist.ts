import { Hono } from "hono";
import { getSetupChecklist, SOURCE_ATTRIBUTION, ALL_NATION_CODES, type NationCode } from "../../services/pacificInvestmentService.js";
import type { AppBindings } from "../../types.js";

// x402-gated in routeSchemas.ts ($0.50 — Decision 23 Bronze ceiling).
// Highest-value output in the suite: sequential step-by-step checklist with
// forms, fees, agencies, and timelines for a specific nation + entity type.
// Decision 60 $0.01 cap does NOT apply: SBP synthesis across 5–6 government
// agency sources per nation (Decision 59).

export const pacificSetupChecklistRoute = new Hono<AppBindings>();

/**
 * GET /invest/pacific-setup-checklist
 * Complete sequential checklist for setting up a business in a Pacific nation.
 * ?nation=ws|fj|vu|pg|to|sb  (REQUIRED)
 * ?entity_type=company|sole_trader|partnership  (default: company)
 */
pacificSetupChecklistRoute.get("/invest/pacific-setup-checklist", (c) => {
  c.header("Cache-Control", "public, max-age=86400");
  c.header("X-Data-Currency", "2026-10");

  const nationParam = (c.req.query("nation") ?? "").toLowerCase() as NationCode;
  const entityType = (c.req.query("entity_type") ?? "company") as
    | "company"
    | "sole_trader"
    | "partnership";

  if (!(ALL_NATION_CODES as string[]).includes(nationParam)) {
    return c.json(
      {
        error: "Invalid or missing nation parameter.",
        valid_values: ALL_NATION_CODES,
        example: "/invest/pacific-setup-checklist?nation=ws&entity_type=company",
      },
      400,
    );
  }

  if (!["company", "sole_trader", "partnership"].includes(entityType)) {
    return c.json(
      {
        error: "Invalid entity_type. Valid values: company, sole_trader, partnership",
      },
      400,
    );
  }

  const checklist = getSetupChecklist(nationParam, entityType);

  if (!checklist) {
    return c.json({ error: "Nation data unavailable." }, 500);
  }

  return c.json({
    data: checklist,
    meta: {
      data_currency: "October 2026",
      disclaimer: SOURCE_ATTRIBUTION.disclaimer,
      sources: SOURCE_ATTRIBUTION.sources,
      publisher: SOURCE_ATTRIBUTION.publisher,
    },
  });
});
