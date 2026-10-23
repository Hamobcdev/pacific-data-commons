import { Hono } from "hono";
import { getCitizenshipInvestment } from "../../services/vanuatuJurisdictionService.js";
import type { AppBindings } from "../../types.js";

/**
 * GET /pacific/vanuatu-citizenship-investment
 *
 * Returns Vanuatu Development Support Programme (DSP / VDSP) citizenship
 * by investment programme details, including current EU Schengen
 * visa-exemption status.
 *
 * Vanuatu Jurisdiction Intelligence (SBP-curated regulatory intelligence,
 * not a Decision 60 open-data wrapper). Priced at $1.30 USDC per
 * PDC-POL-2026-001.
 */
export const vanuatuCitizenshipInvestmentRoute = new Hono<AppBindings>();

vanuatuCitizenshipInvestmentRoute.get("/pacific/vanuatu-citizenship-investment", async (c) => {
  const result = getCitizenshipInvestment();

  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  c.header("X-Data-Source", "Vanuatu Citizenship Office and Commission / Council of the EU");
  c.header("X-Competition-Tag", "x402-global-challenge");
  return c.json(result);
});
