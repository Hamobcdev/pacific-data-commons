import { Hono } from "hono";
import { getVfscLicenses } from "../../services/vanuatuJurisdictionService.js";
import type { AppBindings } from "../../types.js";

/**
 * GET /pacific/vanuatu-vfsc-licenses
 *
 * Returns VFSC financial-services license categories and fit-and-proper
 * criteria under the Company and Trust Services Providers Act No. 8 of
 * 2010.
 *
 * Vanuatu Jurisdiction Intelligence (SBP-curated regulatory intelligence,
 * not a Decision 60 open-data wrapper). Priced at $1.00 USDC per
 * PDC-POL-2026-001.
 */
export const vanuatuVfscLicensesRoute = new Hono<AppBindings>();

vanuatuVfscLicensesRoute.get("/pacific/vanuatu-vfsc-licenses", async (c) => {
  const result = getVfscLicenses();

  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "VFSC - curated regulatory intelligence");
  c.header("X-Competition-Tag", "x402-global-challenge");
  return c.json(result);
});
