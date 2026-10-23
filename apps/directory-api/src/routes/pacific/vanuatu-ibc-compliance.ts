import { Hono } from "hono";
import { getIbcCompliance } from "../../services/vanuatuJurisdictionService.js";
import type { AppBindings } from "../../types.js";

/**
 * GET /pacific/vanuatu-ibc-compliance
 *
 * Returns Vanuatu International Company beneficial-ownership,
 * disclosure, and compliance obligations under the International
 * Companies Act [CAP. 222].
 *
 * Vanuatu Jurisdiction Intelligence (SBP-curated regulatory intelligence,
 * not a Decision 60 open-data wrapper). Priced at $0.60 USDC per
 * PDC-POL-2026-001.
 */
export const vanuatuIbcComplianceRoute = new Hono<AppBindings>();

vanuatuIbcComplianceRoute.get("/pacific/vanuatu-ibc-compliance", async (c) => {
  const result = getIbcCompliance();

  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "VFSC - curated regulatory intelligence");
  c.header("X-Competition-Tag", "x402-global-challenge");
  return c.json(result);
});
