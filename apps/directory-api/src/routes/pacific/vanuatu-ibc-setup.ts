import { Hono } from "hono";
import { getIbcSetup } from "../../services/vanuatuJurisdictionService.js";
import type { AppBindings } from "../../types.js";

/**
 * GET /pacific/vanuatu-ibc-setup
 *
 * Returns curated regulatory intelligence for Vanuatu International
 * Company (IBC) formation under the International Companies Act [CAP. 222].
 *
 * Vanuatu Jurisdiction Intelligence (SBP-curated regulatory intelligence,
 * not a Decision 60 open-data wrapper). Priced at $1.30 USDC per
 * PDC-POL-2026-001.
 */
export const vanuatuIbcSetupRoute = new Hono<AppBindings>();

vanuatuIbcSetupRoute.get("/pacific/vanuatu-ibc-setup", async (c) => {
  const result = getIbcSetup();

  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "VFSC - curated regulatory intelligence");
  c.header("X-Competition-Tag", "x402-global-challenge");
  return c.json(result);
});
