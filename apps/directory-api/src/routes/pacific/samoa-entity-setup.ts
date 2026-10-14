import { Hono } from "hono";
import {
  getEntitySetup,
  parseEntityType,
} from "../../services/samoaSifaService.js";
import type { AppBindings } from "../../types.js";

/**
 * GET /pacific/samoa-entity-setup
 *
 * Returns curated regulatory intelligence for Samoa international entity
 * formation — IBC, trust, foundation, international bank, insurance,
 * partnership, and mutual fund structures.
 *
 * Query params:
 *   entity_type  "ibc" | "trust" | "foundation" | "international_bank" |
 *                "insurance" | "partnership" | "mutual_fund" | "all"
 *                Default: "all"
 *
 * Decision 61 — Pacific Data Registry first-party endpoint.
 * Priced at $0.01 USDC (Decision 60 safe default — repricing above this
 * cap requires a formal Decision Register entry).
 */
export const samoaEntitySetupRoute = new Hono<AppBindings>();

samoaEntitySetupRoute.get("/pacific/samoa-entity-setup", async (c) => {
  const rawEntityType = c.req.query("entity_type");

  let entityType: ReturnType<typeof parseEntityType>;
  try {
    entityType = parseEntityType(rawEntityType);
  } catch (err) {
    return c.json(
      {
        error: "invalid_entity_type",
        message: err instanceof Error ? err.message : "Invalid entity_type parameter",
      },
      400
    );
  }

  const result = getEntitySetup(entityType);

  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "SIFA / MCIL Samoa - curated regulatory intelligence");
  c.header("X-Competition-Tag", "x402-global-challenge");
  return c.json(result);
});
